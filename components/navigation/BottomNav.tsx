import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/theme';
import { currentUser } from '../../data/mockMapData';
import type { ImageSource } from '../../data/types';
import {
  chatRepo,
  initChat,
  subscribeChat,
} from '../../lib/chat/repository';
import { Avatar } from '../common/Avatar';
import { PHONE_SAFE_INSETS } from '../layout/PhoneShell';

type TabKey = 'home' | 'messages' | 'trips' | 'map' | 'profile';

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const [avatar, setAvatar] = useState<ImageSource>(currentUser.avatar);
  const bottomPad =
    insets.bottom > 0
      ? insets.bottom
      : Platform.OS === 'web'
        ? PHONE_SAFE_INSETS.bottom
        : 8;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await initChat();
      const me = await chatRepo.getMe();
      if (!cancelled && me.avatar) setAvatar(me.avatar);
    };
    void load();
    const unsub = subscribeChat(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad }]} accessibilityRole="tablist">
      <View style={styles.row}>
        <Pressable
          style={styles.item}
          onPress={() => onChange('home')}
          accessibilityRole="tab"
          accessibilityLabel="Home"
          accessibilityState={{ selected: active === 'home' }}
        >
          <Ionicons
            name="home-outline"
            size={28}
            color={active === 'home' ? colors.openJoin : colors.navInactive}
          />
        </Pressable>
        <Pressable
          style={styles.item}
          onPress={() => onChange('messages')}
          accessibilityRole="tab"
          accessibilityLabel="Messages"
          accessibilityState={{ selected: active === 'messages' }}
        >
          <Ionicons
            name="chatbubbles-outline"
            size={26}
            color={active === 'messages' ? colors.openJoin : colors.navInactive}
          />
        </Pressable>
        <Pressable
          style={styles.item}
          onPress={() => onChange('trips')}
          accessibilityRole="tab"
          accessibilityLabel="Trips"
          accessibilityState={{ selected: active === 'trips' }}
        >
          <MaterialIcons
            name="flight"
            size={30}
            color={active === 'trips' ? colors.openJoin : colors.navInactive}
          />
        </Pressable>
        <Pressable
          style={styles.item}
          onPress={() => onChange('map')}
          accessibilityRole="tab"
          accessibilityLabel="Map"
          accessibilityState={{ selected: active === 'map' }}
        >
          <MaterialIcons
            name="map"
            size={28}
            color={active === 'map' ? colors.openJoin : colors.navInactive}
          />
        </Pressable>
        <Pressable
          style={styles.item}
          onPress={() => onChange('profile')}
          accessibilityRole="tab"
          accessibilityLabel="Profile"
          accessibilityState={{ selected: active === 'profile' }}
        >
          <Avatar
            source={avatar}
            size={30}
            style={[
              styles.avatar,
              active === 'profile' && {
                borderColor: colors.openJoin,
                borderWidth: 2,
              },
            ]}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 20,
    zIndex: 120,
  },
  row: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  item: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    borderRadius: 15,
  },
});
