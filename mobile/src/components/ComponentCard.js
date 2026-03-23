import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing } from '../styles/theme';

export default function ComponentCard({ component, index, onPress, palette: p }) {
  const pct = (component.confidence * 100).toFixed(1);
  const pos = `${(component.x * 100).toFixed(0)}%, ${(component.y * 100).toFixed(0)}%`;
  const size = `${(component.width * 100).toFixed(0)}×${(component.height * 100).toFixed(0)}%`;

  // Confidence colour
  const confColor =
    component.confidence >= 0.8
      ? (p?.success || '#30d158')
      : component.confidence >= 0.5
      ? (p?.warning || '#ffd60a')
      : (p?.error || '#ff453a');

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: p?.cardAbs || '#10141f',
          borderColor: p?.border || 'rgba(255,255,255,0.10)',
          borderTopColor: p?.borderTop || 'rgba(255,255,255,0.22)',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: p?.primaryGlass || 'rgba(41,151,255,0.16)' }]}>
          <Text style={[styles.badgeText, { color: p?.primary || '#2997ff' }]}>
            {index + 1}
          </Text>
        </View>

        <Text style={[styles.label, { color: p?.text || '#fff' }]} numberOfLines={1}>
          {component.label}
        </Text>

        <View style={[styles.confBadge, { backgroundColor: confColor + '1A' }]}>
          <Text style={[styles.confText, { color: confColor }]}>{pct}%</Text>
        </View>
      </View>

      {/* Description */}
      {component.description ? (
        <Text style={[styles.desc, { color: p?.subtext || 'rgba(255,255,255,0.55)' }]} numberOfLines={2}>
          {component.description}
        </Text>
      ) : null}

      {/* Meta */}
      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={12} color={p?.muted || 'rgba(255,255,255,0.3)'} />
          <Text style={[styles.metaText, { color: p?.muted || 'rgba(255,255,255,0.3)' }]}>{pos}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="resize-outline" size={12} color={p?.muted || 'rgba(255,255,255,0.3)'} />
          <Text style={[styles.metaText, { color: p?.muted || 'rgba(255,255,255,0.3)' }]}>{size}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={p?.muted || 'rgba(255,255,255,0.3)'} style={{ marginLeft: 'auto' }} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  badgeText: { fontSize: 13, fontWeight: '700' },
  label: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  confBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
    flexShrink: 0,
  },
  confText: { fontSize: 12, fontWeight: '700' },
  desc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
});
