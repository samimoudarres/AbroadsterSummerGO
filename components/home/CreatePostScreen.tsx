import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type {
  ChatCommunity,
  ChatProfile,
  ChatTrip,
  CreatePostInput,
} from '../../data/chatTypes';
import {
  COLLAGE_LAYOUTS,
  DEFAULT_CROP,
  slotCount,
  type CollageLayoutId,
  type PhotoCrop,
} from '../../lib/feed/collageLayouts';
import { feedImageSource } from '../../lib/feed/feedPhotos';
import { getImageAspectSync } from '../../lib/feed/imageAspect';
import {
  loadGalleryAssets,
  pickExtraFromLibrary,
  type GalleryAsset,
} from '../../lib/feed/galleryAssets';
import {
  clearCreatePostDraft,
  getCreatePostDraft,
  mergeGalleryWithLibrary,
  saveCreatePostDraft,
} from '../../lib/feed/createPostDraft';
import { searchPlaces, type PlaceSuggestion } from '../../lib/geocode';
import { MAPBOX_TOKEN } from '../../lib/mapConfig';
import { chatRepo, DEMO_ME_ID, initChat } from '../../lib/chat/repository';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import { SwipeBackScreen } from '../../lib/gestures/useEdgeSwipeBack';
import DestinationMapPreview from '../trips/DestinationMapPreview';
import { Avatar } from '../common/Avatar';
import { CollageCanvas } from './create/CollageCanvas';
import { shortCalendarRange } from '../../lib/trips/dates';

type Step = 'picker' | 'edit' | 'details';
type Mode = 'collage' | 'carousel';

const CAROUSEL_MAX = 10;
const SCREEN_W = Dimensions.get('window').width;

interface CreatePostScreenProps {
  onClose: () => void;
  onPosted?: (postId: string) => void;
  /** When set, screen loads that post for full edit + save via updatePost. */
  editPostId?: string | null;
}

export function CreatePostScreen({
  onClose,
  onPosted,
  editPostId = null,
}: CreatePostScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad = usePhoneTopPad(0);
  const isEditing = Boolean(editPostId);
  const saved = isEditing ? null : getCreatePostDraft();
  const [step, setStep] = useState<Step>(isEditing ? 'details' : 'picker');
  const [mode, setMode] = useState<Mode>(saved?.mode ?? 'collage');
  const [layoutId, setLayoutId] = useState<CollageLayoutId>(
    saved?.layoutId ?? 'tri_top2',
  );
  const [gallery, setGallery] = useState<GalleryAsset[]>(
    saved?.libraryAssets ?? [],
  );
  const [libraryAssets, setLibraryAssets] = useState<GalleryAsset[]>(
    saved?.libraryAssets ?? [],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    saved?.selectedIds ?? [],
  );
  const [crops, setCrops] = useState<PhotoCrop[]>(saved?.crops ?? []);
  const [editSlot, setEditSlot] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [editReady, setEditReady] = useState(!isEditing);

  const [caption, setCaption] = useState(saved?.caption ?? '');
  const [taggedTripId, setTaggedTripId] = useState<string | null>(
    saved?.taggedTripId ?? null,
  );
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>(
    saved?.taggedUserIds ?? [],
  );
  const [trips, setTrips] = useState<ChatTrip[]>([]);
  const [communities, setCommunities] = useState<ChatCommunity[]>([]);
  const [friends, setFriends] = useState<ChatProfile[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleHits, setPeopleHits] = useState<ChatProfile[]>([]);
  const [showTagTrip, setShowTagTrip] = useState(false);
  const [showTagPeople, setShowTagPeople] = useState(false);

  const [cityQuery, setCityQuery] = useState(saved?.cityQuery ?? '');
  const [placeHits, setPlaceHits] = useState<PlaceSuggestion[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(
    saved?.selectedPlace ?? null,
  );
  const [audience, setAudience] = useState<'all' | 'friends' | 'communities'>(
    saved?.audience ?? 'all',
  );
  const [audienceCommunityIds, setAudienceCommunityIds] = useState<string[]>(
    saved?.audienceCommunityIds ?? [],
  );
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await initChat();
      const assets = await loadGalleryAssets();
      // Never wipe photos the user already added from their library
      setGallery((prev) => {
        const picked = [
          ...libraryAssets,
          ...prev.filter((a) => a.id.startsWith('picked-')),
        ];
        return mergeGalleryWithLibrary(assets, picked);
      });
      const [myTrips, comms, me] = await Promise.all([
        chatRepo.getTripsForMe(),
        chatRepo.getMyCommunities(),
        chatRepo.getMe(),
      ]);
      setTrips(myTrips);
      setCommunities(comms);
      const hits = await chatRepo.searchUsers('a');
      const friendsList = hits.slice(0, 12);
      setFriends(friendsList);
      const map: Record<string, ChatProfile> = { [me.id]: me };
      for (const f of friendsList) map[f.id] = f;
      setProfiles(map);

      if (editPostId) {
        const post = await chatRepo.getPost(editPostId);
        if (!post) {
          setError('Could not load post to edit');
          setEditReady(true);
          return;
        }
        const editAssets: GalleryAsset[] = (post.photoUrls ?? []).map(
          (uri, i) => ({
            id: `edit-${post.id}-${i}`,
            uri,
          }),
        );
        setLibraryAssets(editAssets);
        setGallery((prev) => mergeGalleryWithLibrary(assets, editAssets));
        setSelectedIds(editAssets.map((a) => a.id));
        setCrops(
          (post.photoCrops ?? []).map((c) => ({
            scale: c?.scale ?? 1,
            offsetX: c?.offsetX ?? 0,
            offsetY: c?.offsetY ?? 0,
          })),
        );
        setMode(post.displayMode === 'collage' ? 'collage' : 'carousel');
        if (post.collageLayoutId) {
          setLayoutId(post.collageLayoutId as CollageLayoutId);
        }
        setCaption(post.caption ?? '');
        setTaggedTripId(post.taggedTripId ?? null);
        setTaggedUserIds(post.taggedUserIds ?? []);
        setAudience(post.audience ?? 'all');
        setAudienceCommunityIds(post.audienceCommunityIds ?? []);
        const label = post.locationLabel || '';
        const [cityPart, ...rest] = label.split(',').map((s) => s.trim());
        setCityQuery(cityPart || label);
        setSelectedPlace({
          id: `edit-place-${post.id}`,
          cityName: cityPart || label,
          countryName: rest.join(', ') || '',
          placeName: label,
          latitude: post.latitude ?? 0,
          longitude: post.longitude ?? 0,
        });
        setStep('details');
        setEditReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPostId]);

  // Persist draft so library picks / selection survive leaving create-post
  useEffect(() => {
    if (isEditing) return;
    saveCreatePostDraft({
      mode,
      layoutId,
      libraryAssets,
      selectedIds,
      crops,
      caption,
      cityQuery,
      selectedPlace,
      audience,
      audienceCommunityIds,
      taggedTripId,
      taggedUserIds,
    });
  }, [
    isEditing,
    mode,
    layoutId,
    libraryAssets,
    selectedIds,
    crops,
    caption,
    cityQuery,
    selectedPlace,
    audience,
    audienceCommunityIds,
    taggedTripId,
    taggedUserIds,
  ]);

  useEffect(() => {
    const q = cityQuery.trim();
    if (q.length < 2) {
      setPlaceHits([]);
      return;
    }
    if (selectedPlace && q === selectedPlace.cityName) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const hits = await searchPlaces(q, MAPBOX_TOKEN);
      if (!cancelled) setPlaceHits(hits);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cityQuery, selectedPlace]);

  useEffect(() => {
    const q = peopleQuery.trim();
    if (q.length < 1) {
      setPeopleHits([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const hits = await chatRepo.searchUsers(q);
      if (!cancelled) setPeopleHits(hits);
    })();
    return () => {
      cancelled = true;
    };
  }, [peopleQuery]);

  const maxPhotos =
    mode === 'collage' ? slotCount(layoutId) : CAROUSEL_MAX;

  const selectedPhotos = useMemo(() => {
    return selectedIds
      .map(
        (id) =>
          gallery.find((g) => g.id === id)?.uri ??
          libraryAssets.find((g) => g.id === id)?.uri,
      )
      .filter((u) => u != null) as Array<string | number>;
  }, [selectedIds, gallery, libraryAssets]);

  // Keep crops aligned with selection length
  useEffect(() => {
    setCrops((prev) => {
      const next = selectedPhotos.map((_, i) => prev[i] ?? { ...DEFAULT_CROP });
      return next.slice(0, selectedPhotos.length);
    });
  }, [selectedPhotos.length]);

  const setModeAnimated = (next: Mode) => {
    setMode(next);
    // Keep already-chosen photos; only trim if the new mode needs fewer
    const limit = next === 'collage' ? slotCount(layoutId) : CAROUSEL_MAX;
    setSelectedIds((prev) => prev.slice(0, limit));
    if (next === 'collage' && !layoutId) setLayoutId('tri_top2');
  };

  const toggleSelect = (asset: GalleryAsset) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(asset.id);
      if (idx >= 0) return prev.filter((id) => id !== asset.id);
      if (prev.length >= maxPhotos) return prev;
      return [...prev, asset.id];
    });
  };

  const addFromLibrary = async () => {
    const room = Math.max(1, maxPhotos - selectedIds.length);
    const extra = await pickExtraFromLibrary(room);
    if (!extra.length) return;
    setLibraryAssets((prev) => mergeGalleryWithLibrary(prev, extra));
    setGallery((g) => mergeGalleryWithLibrary(g, extra));
    setSelectedIds((prev) => {
      const next = [...prev];
      for (const a of extra) {
        if (next.length >= maxPhotos) break;
        if (!next.includes(a.id)) next.push(a.id);
      }
      return next;
    });
  };

  const canNextPicker =
    mode === 'carousel'
      ? selectedPhotos.length >= 1
      : selectedPhotos.length === maxPhotos;

  const onNextFromPicker = () => {
    if (!canNextPicker) {
      setError(
        mode === 'collage'
          ? `Select ${maxPhotos} photo${maxPhotos === 1 ? '' : 's'} for this collage`
          : 'Select at least one photo',
      );
      return;
    }
    setError(null);
    setEditSlot(0);
    setStep('edit');
  };

  const swapSlots = (a: number, b: number) => {
    if (a === b || a < 0 || b < 0) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      if (a >= next.length || b >= next.length) return prev;
      const tmp = next[a];
      next[a] = next[b];
      next[b] = tmp;
      return next;
    });
    setCrops((prev) => {
      const next = [...prev];
      while (next.length < Math.max(a, b) + 1) next.push({ ...DEFAULT_CROP });
      const tmp = next[a];
      next[a] = next[b];
      next[b] = tmp;
      return next;
    });
  };

  const onShare = async () => {
    if (!selectedPlace) {
      setError('Add a location to share your post');
      return;
    }
    if (!selectedPhotos.length) {
      setError('Add at least one photo');
      return;
    }
    setSharing(true);
    setError(null);
    try {
      const input: CreatePostInput = {
        caption: caption.trim(),
        locationLabel: [
          selectedPlace.cityName,
          selectedPlace.countryName,
        ]
          .filter(Boolean)
          .join(', '),
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
        displayMode: mode,
        collageLayoutId: mode === 'collage' ? layoutId : null,
        audience,
        audienceCommunityIds:
          audience === 'communities' ? audienceCommunityIds : [],
        taggedTripId,
        taggedUserIds,
        photos: selectedPhotos.map((uri, i) => ({
          uri: uri as string,
          crop: crops[i] ?? DEFAULT_CROP,
        })),
      };
      const post =
        isEditing && editPostId
          ? await chatRepo.updatePost(editPostId, input)
          : await chatRepo.createPost(input);
      if (!isEditing) clearCreatePostDraft();
      onPosted?.(post.id);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? (isEditing ? 'Could not save post' : 'Could not share post'));
    } finally {
      setSharing(false);
    }
  };

  const previewW = Math.min(SCREEN_W - 32, 360);

  const headerTitle = isEditing
    ? step === 'edit'
      ? mode === 'collage'
        ? 'Edit collage'
        : 'Edit photos'
      : step === 'picker'
        ? 'Change photos'
        : 'Edit post'
    : step === 'picker'
      ? 'New post'
      : step === 'edit'
        ? mode === 'collage'
          ? 'Edit collage'
          : 'Edit photos'
        : 'New post';

  if (isEditing && !editReady) {
    return (
      <View style={[styles.root, { paddingTop: topPad, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.openJoin} />
      </View>
    );
  }

  return (
    <SwipeBackScreen onClose={onClose}>
    <View style={[styles.root, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (step === 'picker') onClose();
            else if (step === 'edit') setStep('picker');
            else setStep(mode === 'collage' ? 'edit' : 'picker');
          }}
          hitSlop={12}
          style={styles.headerBtn}
        >
          <Ionicons
            name={step === 'picker' ? 'close' : 'chevron-back'}
            size={28}
            color={colors.black}
          />
        </Pressable>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        {step !== 'details' ? (
          <Pressable
            onPress={step === 'picker' ? onNextFromPicker : () => setStep('details')}
            hitSlop={8}
            style={styles.headerBtn}
          >
            <Text
              style={[
                styles.nextText,
                step === 'picker' && !canNextPicker && styles.nextMuted,
              ]}
            >
              Next
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {error ? (
        <Text style={styles.errorBanner}>{error}</Text>
      ) : null}

      {step === 'picker' ? (
        <View style={styles.flex}>
          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <Pressable
              style={styles.modeBtn}
              onPress={() => setModeAnimated('collage')}
            >
              <Text
                style={[
                  styles.modeLabel,
                  mode === 'collage' && styles.modeLabelOn,
                ]}
              >
                Collage
              </Text>
            </Pressable>
            <Pressable
              style={styles.modeBtn}
              onPress={() => setModeAnimated('carousel')}
            >
              <Text
                style={[
                  styles.modeLabel,
                  mode === 'carousel' && styles.modeLabelOn,
                ]}
              >
                Carousel
              </Text>
            </Pressable>
            <View
              style={[
                styles.modeUnderline,
                { left: mode === 'collage' ? '5%' : '55%' },
              ]}
            />
          </View>

          {/* Top: collage layouts + live fill preview */}
          <View style={styles.topHalf}>
            {mode === 'collage' ? (
              <>
                <Text style={styles.layoutsLabel}>Choose a layout</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={styles.templateRow}
                >
                  {COLLAGE_LAYOUTS.map((layout) => {
                    const selected = layout.id === layoutId;
                    const tw = 72;
                    return (
                      <Pressable
                        key={layout.id}
                        onPress={() => {
                          setLayoutId(layout.id);
                          setSelectedIds((prev) =>
                            prev.slice(0, layout.slots.length),
                          );
                        }}
                        style={[
                          styles.templateCard,
                          selected && styles.templateCardOn,
                        ]}
                      >
                        <CollageCanvas
                          layoutId={layout.id}
                          photos={[]}
                          width={tw}
                          showPlaceholders
                          templateMode
                          showSlotNumbers
                        />
                        <Text style={styles.templateLabel}>
                          {layout.label} · {layout.hint}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={styles.livePreviewWrap}>
                  <CollageCanvas
                    layoutId={layoutId}
                    photos={selectedPhotos}
                    crops={crops}
                    width={Math.min(previewW, 200)}
                    showPlaceholders
                    showSlotNumbers
                  />
                  <Text style={styles.liveHint}>
                    Select photos below — they fill slots 1→{maxPhotos} in order (
                    {selectedPhotos.length}/{maxPhotos})
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.carouselPreview}>
                {selectedPhotos.length ? (
                  (() => {
                    const frameAspect = Math.max(
                      0.75,
                      Math.min(1.35, getImageAspectSync(selectedPhotos[0])),
                    );
                    const w = Math.min(previewW, SCREEN_W - 32);
                    const h = Math.min(320, w / frameAspect);
                    return (
                      <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        style={{ height: h }}
                      >
                        {selectedPhotos.map((uri, i) => (
                          <View
                            key={`cprev-${i}`}
                            style={[
                              styles.carouselSlide,
                              { width: w, height: h },
                            ]}
                          >
                            <Image
                              source={feedImageSource(uri as any)}
                              style={{ width: w, height: h }}
                              resizeMode="cover"
                            />
                            {selectedPhotos.length > 1 ? (
                              <View style={styles.countPill}>
                                <Text style={styles.countText}>
                                  {i + 1}/{selectedPhotos.length}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ))}
                      </ScrollView>
                    );
                  })()
                ) : (
                  <View style={[styles.carouselHero, styles.carouselEmpty]}>
                    <Ionicons
                      name="images-outline"
                      size={40}
                      color={colors.textMuted}
                    />
                    <Text style={styles.carouselHint}>
                      Select photos for your carousel
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Gallery */}
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryTitle}>Recents</Text>
            <Pressable onPress={() => void addFromLibrary()}>
              <Text style={styles.addLib}>Add from library</Text>
            </Pressable>
          </View>
          <FlatList
            data={gallery}
            keyExtractor={(a) => a.id}
            numColumns={4}
            style={styles.gallery}
            renderItem={({ item, index }) => {
              const selIdx = selectedIds.indexOf(item.id);
              const selected = selIdx >= 0;
              return (
                <Pressable
                  onPress={() => toggleSelect(item)}
                  style={styles.gridCell}
                >
                  <Image
                    source={feedImageSource(item.uri as any)}
                    style={styles.gridImg}
                    resizeMode="cover"
                  />
                  <View
                    style={[
                      styles.selectBadge,
                      selected && styles.selectBadgeOn,
                    ]}
                  >
                    {selected ? (
                      <Text style={styles.selectNum}>{selIdx + 1}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {step === 'edit' ? (
        mode === 'collage' ? (
          <CollageEditStep
            layoutId={layoutId}
            photos={selectedPhotos}
            crops={crops}
            setCrops={setCrops}
            editSlot={editSlot}
            setEditSlot={setEditSlot}
            onSwap={swapSlots}
            dragFrom={dragFrom}
            setDragFrom={setDragFrom}
            width={previewW}
          />
        ) : (
          <CarouselEditStep
            photos={selectedPhotos}
            crops={crops}
            setCrops={setCrops}
            editSlot={editSlot}
            setEditSlot={setEditSlot}
            onSwap={swapSlots}
            dragFrom={dragFrom}
            setDragFrom={setDragFrom}
            width={previewW}
          />
        )
      ) : null}

      {step === 'details' ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.detailsPreview}>
            {mode === 'collage' ? (
              <CollageCanvas
                layoutId={layoutId}
                photos={selectedPhotos}
                crops={crops}
                width={previewW}
                showPlaceholders={false}
              />
            ) : (
              (() => {
                const frameAspect = Math.max(
                  0.75,
                  Math.min(
                    1.35,
                    selectedPhotos[0]
                      ? getImageAspectSync(selectedPhotos[0])
                      : 1,
                  ),
                );
                const w = previewW;
                const h = Math.min(360, w / frameAspect);
                return (
                  <ScrollView horizontal pagingEnabled style={{ height: h }}>
                    {selectedPhotos.map((uri, i) => (
                      <View
                        key={`d-${i}`}
                        style={{
                          width: w,
                          height: h,
                          overflow: 'hidden',
                          backgroundColor: '#111',
                        }}
                      >
                        <CarouselCroppedImage
                          uri={uri}
                          crop={crops[i] ?? DEFAULT_CROP}
                          width={w}
                          height={h}
                        />
                      </View>
                    ))}
                  </ScrollView>
                );
              })()
            )}
          </View>

          <TextInput
            style={styles.caption}
            placeholder="Write a caption…"
            placeholderTextColor={colors.textMuted}
            value={caption}
            onChangeText={setCaption}
            multiline
          />

          <Pressable
            style={styles.rowAction}
            onPress={() => setShowTagTrip((v) => !v)}
          >
            <Ionicons name="airplane-outline" size={22} color={colors.black} />
            <Text style={styles.rowActionText}>
              {taggedTripId
                ? `Trip: ${
                    trips.find((t) => t.id === taggedTripId)?.destinationCity ??
                    'Tagged'
                  }`
                : 'Tag trip (optional)'}
            </Text>
            <Ionicons
              name={showTagTrip ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
          {showTagTrip ? (
            <View style={styles.sheetBlock}>
              <Text style={styles.tripHint}>
                Link this post to a trip you’re on — viewers can open the album.
              </Text>
              <Pressable
                style={[styles.tripRow, !taggedTripId && styles.tripRowOn]}
                onPress={() => {
                  setTaggedTripId(null);
                }}
              >
                <Ionicons
                  name={!taggedTripId ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={!taggedTripId ? colors.openJoin : colors.textMuted}
                />
                <Text style={styles.tripRowTitle}>No trip</Text>
              </Pressable>
              {trips.length === 0 ? (
                <Text style={styles.tripEmpty}>
                  You’re not on any trips yet. Create or join one first.
                </Text>
              ) : (
                trips.map((t) => {
                  const on = taggedTripId === t.id;
                  const dates =
                    shortCalendarRange(t.dateStart, t.dateEnd, t.dateLabel) ||
                    t.dateLabel ||
                    '';
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.tripRow, on && styles.tripRowOn]}
                      onPress={() => {
                        setTaggedTripId(t.id);
                        const members = (t.memberIds ?? []).filter(
                          (id) => id !== DEMO_ME_ID,
                        );
                        setTaggedUserIds((prev) =>
                          [...new Set([...prev, ...members])],
                        );
                        members.forEach(async (id) => {
                          const p = await chatRepo.getProfile(id);
                          if (p) setProfiles((m) => ({ ...m, [id]: p }));
                        });
                      }}
                    >
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'airplane-outline'}
                        size={22}
                        color={on ? colors.openJoin : colors.programBlue}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tripRowTitle, on && styles.chipTextOn]}>
                          {t.destinationCity}
                          {t.destinationCountry
                            ? `, ${t.destinationCountry}`
                            : ''}
                        </Text>
                        {dates ? (
                          <Text style={styles.tripRowSub}>{dates}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}

          <Pressable
            style={styles.rowAction}
            onPress={() => setShowTagPeople((v) => !v)}
          >
            <Ionicons name="people-outline" size={22} color={colors.black} />
            <Text style={styles.rowActionText}>
              Tag people
              {taggedUserIds.length ? ` (${taggedUserIds.length})` : ''}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          {showTagPeople ? (
            <View style={styles.sheetBlock}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search people"
                placeholderTextColor={colors.textMuted}
                value={peopleQuery}
                onChangeText={setPeopleQuery}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {taggedUserIds.map((id) => (
                  <Pressable
                    key={id}
                    style={styles.personChip}
                    onPress={() =>
                      setTaggedUserIds((p) => p.filter((x) => x !== id))
                    }
                  >
                    <Avatar source={profiles[id]?.avatar} size={28} />
                    <Text style={styles.personChipText}>
                      {profiles[id]?.firstName ?? 'User'}
                    </Text>
                    <Ionicons name="close" size={14} color={colors.textMuted} />
                  </Pressable>
                ))}
              </ScrollView>
              {(peopleHits.length ? peopleHits : friends).map((p) => {
                const on = taggedUserIds.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    style={styles.personRow}
                    onPress={() => {
                      setProfiles((m) => ({ ...m, [p.id]: p }));
                      setTaggedUserIds((prev) =>
                        on
                          ? prev.filter((x) => x !== p.id)
                          : [...prev, p.id],
                      );
                    }}
                  >
                    <Avatar source={p.avatar} size={36} />
                    <Text style={styles.personName}>{p.fullName}</Text>
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={on ? colors.openJoin : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>
            Location <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search a city or country…"
            placeholderTextColor={colors.textMuted}
            value={cityQuery}
            onChangeText={(t) => {
              setCityQuery(t);
              if (selectedPlace && t !== selectedPlace.cityName) {
                setSelectedPlace(null);
              }
            }}
          />
          {placeHits.map((hit) => (
            <Pressable
              key={`${hit.cityName}-${hit.latitude}`}
              style={styles.placeHit}
              onPress={() => {
                setSelectedPlace(hit);
                setCityQuery(hit.cityName);
                setPlaceHits([]);
              }}
            >
              <Ionicons name="location-sharp" size={16} color={colors.openJoin} />
              <Text style={styles.placeHitText}>
                {hit.cityName}
                {hit.countryName ? `, ${hit.countryName}` : ''}
              </Text>
            </Pressable>
          ))}
          <DestinationMapPreview
            latitude={selectedPlace?.latitude ?? null}
            longitude={selectedPlace?.longitude ?? null}
            pinLabel={
              selectedPlace
                ? `${selectedPlace.cityName}${
                    selectedPlace.countryName
                      ? `, ${selectedPlace.countryName}`
                      : ''
                  }`
                : undefined
            }
          />

          <Text style={styles.sectionLabel}>Audience</Text>
          <View style={styles.audienceRow}>
            {(
              [
                ['all', 'All'],
                ['friends', 'Friends'],
                ['communities', 'Schools'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                style={[
                  styles.audienceChip,
                  audience === key && styles.audienceChipOn,
                ]}
                onPress={() => setAudience(key)}
              >
                <Text
                  style={[
                    styles.audienceText,
                    audience === key && styles.audienceTextOn,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {audience === 'communities' ? (
            <View style={styles.sheetBlock}>
              {communities.map((c) => {
                const on = audienceCommunityIds.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() =>
                      setAudienceCommunityIds((prev) =>
                        on
                          ? prev.filter((id) => id !== c.id)
                          : [...prev, c.id],
                      )
                    }
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Pressable
            style={[styles.shareBtn, sharing && { opacity: 0.7 }]}
            onPress={onShare}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.shareText}>
                {isEditing ? 'Save' : 'Share'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
    </SwipeBackScreen>
  );
}

function CollageEditStep({
  layoutId,
  photos,
  crops,
  setCrops,
  editSlot,
  setEditSlot,
  onSwap,
  dragFrom,
  setDragFrom,
  width,
}: {
  layoutId: CollageLayoutId;
  photos: Array<string | number>;
  crops: PhotoCrop[];
  setCrops: React.Dispatch<React.SetStateAction<PhotoCrop[]>>;
  editSlot: number | null;
  setEditSlot: (n: number | null) => void;
  onSwap: (a: number, b: number) => void;
  dragFrom: number | null;
  setDragFrom: (n: number | null) => void;
  width: number;
}) {
  return (
    <ScrollView contentContainerStyle={styles.editBody}>
      <Text style={styles.editHint}>
        Drag a photo with your finger to reposition · Pinch to zoom · Long-press
        a number to swap slots
      </Text>
      <View style={{ alignItems: 'center' }}>
        <CollageCanvas
          layoutId={layoutId}
          photos={photos}
          crops={crops}
          width={width}
          selectedSlot={editSlot ?? dragFrom}
          onPressSlot={(i) => {
            if (dragFrom != null) {
              onSwap(dragFrom, i);
              setDragFrom(null);
              return;
            }
            setEditSlot(i);
          }}
          onCropChange={(i, crop) => {
            setCrops((prev) => {
              const next = [...prev];
              while (next.length <= i) next.push({ ...DEFAULT_CROP });
              next[i] = crop;
              return next;
            });
          }}
          interactiveCrop
          showPlaceholders={false}
          showSlotNumbers={false}
        />
      </View>
      <View style={styles.swapRow}>
        {photos.map((_, i) => (
          <Pressable
            key={`swap-${i}`}
            onLongPress={() => setDragFrom(i)}
            onPress={() => {
              if (dragFrom != null) {
                onSwap(dragFrom, i);
                setDragFrom(null);
              } else setEditSlot(i);
            }}
            style={[
              styles.swapChip,
              (editSlot === i || dragFrom === i) && styles.swapChipOn,
            ]}
          >
            <Text
              style={[
                styles.swapChipText,
                (editSlot === i || dragFrom === i) && { color: '#fff' },
              ]}
            >
              {i + 1}
            </Text>
          </Pressable>
        ))}
      </View>
      {dragFrom != null ? (
        <Text style={styles.dragHint}>
          Swapping slot {dragFrom + 1} — tap another slot to swap
        </Text>
      ) : editSlot != null ? (
        <Text style={styles.dragHint}>
          Editing slot {editSlot + 1} — drag inside the photo to move it
        </Text>
      ) : (
        <Text style={styles.editHint}>Tap a slot to edit it</Text>
      )}
    </ScrollView>
  );
}

/** Carousel crop editor — keeps each photo’s native aspect ratio. */
function CarouselEditStep({
  photos,
  crops,
  setCrops,
  editSlot,
  setEditSlot,
  onSwap,
  dragFrom,
  setDragFrom,
  width,
}: {
  photos: Array<string | number>;
  crops: PhotoCrop[];
  setCrops: React.Dispatch<React.SetStateAction<PhotoCrop[]>>;
  editSlot: number | null;
  setEditSlot: (n: number | null) => void;
  onSwap: (a: number, b: number) => void;
  dragFrom: number | null;
  setDragFrom: (n: number | null) => void;
  width: number;
}) {
  const idx = editSlot ?? 0;
  const uri = photos[idx];
  const aspect = uri != null ? getImageAspectSync(uri) : 1;
  const h = Math.min(420, Math.max(180, width / aspect));

  return (
    <ScrollView contentContainerStyle={styles.editBody}>
      <Text style={styles.editHint}>
        Photos keep their original shape · Drag to reposition · Pinch to zoom
      </Text>
      <View style={{ alignItems: 'center' }}>
        {uri != null ? (
          <CollageCanvas
            layoutId="single"
            photos={[uri]}
            crops={[crops[idx] ?? DEFAULT_CROP]}
            width={width}
            height={h}
            selectedSlot={0}
            interactiveCrop
            showPlaceholders={false}
            onCropChange={(_, crop) => {
              setCrops((prev) => {
                const next = [...prev];
                while (next.length <= idx) next.push({ ...DEFAULT_CROP });
                next[idx] = crop;
                return next;
              });
            }}
          />
        ) : null}
      </View>
      <View style={styles.swapRow}>
        {photos.map((p, i) => (
          <Pressable
            key={`cswap-${i}`}
            onLongPress={() => setDragFrom(i)}
            onPress={() => {
              if (dragFrom != null) {
                onSwap(dragFrom, i);
                setDragFrom(null);
              } else setEditSlot(i);
            }}
            style={[
              styles.swapChip,
              (idx === i || dragFrom === i) && styles.swapChipOn,
            ]}
          >
            <Text
              style={[
                styles.swapChipText,
                (idx === i || dragFrom === i) && { color: '#fff' },
              ]}
            >
              {i + 1}
            </Text>
          </Pressable>
        ))}
      </View>
      {dragFrom != null ? (
        <Text style={styles.dragHint}>
          Swapping photo {dragFrom + 1} — tap another to swap order
        </Text>
      ) : (
        <Text style={styles.dragHint}>
          Editing photo {idx + 1} of {photos.length}
        </Text>
      )}
    </ScrollView>
  );
}

/** Static cropped carousel slide for details preview. */
function CarouselCroppedImage({
  uri,
  crop,
  width,
  height,
}: {
  uri: string | number;
  crop: PhotoCrop;
  width: number;
  height: number;
}) {
  return (
    <CollageCanvas
      layoutId="single"
      photos={[uri]}
      crops={[crop]}
      width={width}
      height={height}
      showPlaceholders={false}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  headerBtn: { minWidth: 56, alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
  },
  nextText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.openJoin,
  },
  nextMuted: { opacity: 0.4 },
  errorBanner: {
    backgroundColor: '#FFF0F0',
    color: '#B00020',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  modeToggle: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    position: 'relative',
  },
  modeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  modeLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textMuted,
  },
  modeLabelOn: { color: colors.black },
  modeUnderline: {
    position: 'absolute',
    bottom: 0,
    width: '40%',
    height: 2,
    backgroundColor: colors.openJoin,
  },
  topHalf: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  layoutsLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.black,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  templateRow: {
    paddingHorizontal: 12,
    gap: 10,
    alignItems: 'flex-end',
    paddingBottom: 4,
  },
  templateCard: {
    width: 88,
    padding: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#f6f6f6',
    alignItems: 'center',
  },
  templateCardOn: { borderColor: colors.openJoin },
  templateLabel: {
    marginTop: 4,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textMuted,
    maxWidth: 84,
  },
  carouselSlide: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePreviewWrap: { alignItems: 'center', marginTop: 8, paddingBottom: 4 },
  liveHint: {
    marginTop: 6,
    paddingHorizontal: 16,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  carouselPreview: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  carouselHero: { width: '100%', height: 200 },
  carouselEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eee',
    gap: 8,
  },
  carouselHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  countPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: { color: '#fff', fontFamily: fonts.bold, fontSize: 12 },
  galleryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  galleryTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
  },
  addLib: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.openJoin,
  },
  gallery: { flex: 1 },
  gridCell: {
    width: '25%',
    aspectRatio: 1,
    padding: 1,
  },
  gridImg: { width: '100%', height: '100%', backgroundColor: '#ddd' },
  selectBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBadgeOn: { backgroundColor: colors.openJoin, borderColor: '#fff' },
  selectNum: { color: '#fff', fontFamily: fonts.bold, fontSize: 11 },
  editBody: { padding: 16, paddingBottom: 48 },
  editHint: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
  },
  swapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
  },
  swapChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapChipOn: { backgroundColor: colors.openJoin },
  swapChipText: { fontFamily: fonts.bold, color: colors.black },
  dragHint: {
    textAlign: 'center',
    marginTop: 8,
    color: colors.openJoin,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  cropPanel: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#f7f9fb',
  },
  cropTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    marginBottom: 10,
  },
  cropLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 8,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 8,
  },
  sliderVal: { fontFamily: fonts.bold, fontSize: 16, minWidth: 48, textAlign: 'center' },
  panPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 168,
    alignSelf: 'center',
    marginTop: 8,
  },
  panBtn: {
    width: 56,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panBtnText: { fontSize: 18 },
  doneCrop: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.openJoin,
  },
  detailsPreview: { alignItems: 'center', paddingTop: 12 },
  caption: {
    marginHorizontal: 16,
    marginTop: 16,
    minHeight: 72,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.black,
    textAlignVertical: 'top',
  },
  rowAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  rowActionText: { flex: 1, fontFamily: fonts.bold, fontSize: 15 },
  sheetBlock: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  tripHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: 4,
  },
  tripEmpty: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: 8,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  tripRowOn: {
    backgroundColor: 'rgba(23,88,100,0.12)',
  },
  tripRowTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  tripRowSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#eee',
    marginRight: 8,
    marginBottom: 4,
  },
  chipOn: { backgroundColor: 'rgba(23,88,100,0.15)' },
  chipText: { fontFamily: fonts.regular, fontSize: 13, color: colors.black },
  chipTextOn: { color: colors.openJoin, fontFamily: fonts.bold },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  personChipText: { fontFamily: fonts.bold, fontSize: 12 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  personName: { flex: 1, fontFamily: fonts.bold, fontSize: 14 },
  sectionLabel: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.black,
  },
  required: { color: '#E53935' },
  placeHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  placeHitText: { fontFamily: fonts.regular, fontSize: 14 },
  audienceRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  audienceChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#eee',
  },
  audienceChipOn: { backgroundColor: colors.openJoin },
  audienceText: { fontFamily: fonts.bold, fontSize: 13, color: colors.black },
  audienceTextOn: { color: '#fff' },
  shareBtn: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: colors.openJoin,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: '#fff',
  },
});
