import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../constants/theme';
import type { ImageSource } from '../../data/types';
import { Avatar } from '../common/Avatar';

interface GroupAvatarProps {
  avatars: ImageSource[];
  size?: number;
  glowColor?: string;
  showGlow?: boolean;
}

/** Matches the map pin group collage (tri / quad inside a circle). */
export function GroupAvatar({
  avatars,
  size = 45,
  glowColor,
  showGlow = false,
}: GroupAvatarProps) {
  const count = Math.min(avatars.length, 4);
  const positions =
    count <= 3
      ? [
          { left: size * 0.14, top: size * 0.1, s: size * 0.47 },
          { left: size * 0.49, top: size * 0.4, s: size * 0.38 },
          { left: size * 0.2, top: size * 0.56, s: size * 0.33 },
        ]
      : [
          { left: size * 0.06, top: size * 0.12, s: size * 0.42 },
          { left: size * 0.52, top: size * 0.08, s: size * 0.29 },
          { left: size * 0.52, top: size * 0.42, s: size * 0.38 },
          { left: size * 0.18, top: size * 0.58, s: size * 0.31 },
        ];

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          shadowColor: glowColor ?? 'transparent',
          shadowOpacity: showGlow ? 1 : 0,
          shadowRadius: showGlow ? 10 : 0,
        },
        showGlow && glowColor
          ? { borderWidth: 2, borderColor: colors.white }
          : null,
      ]}
    >
      {avatars.slice(0, 4).map((src, i) => {
        const pos = positions[i];
        return (
          <Avatar
            key={i}
            source={src}
            size={pos.s}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.groupAvatarBg,
    overflow: 'hidden',
    position: 'relative',
  },
});
