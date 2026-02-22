import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';

export default function ComponentCard({ component, index, onPress }) {
  const confidencePercent = (component.confidence * 100).toFixed(1);
  const position = `(${(component.x * 100).toFixed(1)}%, ${(component.y * 100).toFixed(1)}%)`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>#{index + 1}</Text>
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.label}>{component.label}</Text>
          <Text style={styles.confidence}>{confidencePercent}%</Text>
        </View>
      </View>

      {component.description && (
        <Text style={styles.description} numberOfLines={2}>
          {component.description}
        </Text>
      )}

      <View style={styles.meta}>
        <Text style={styles.metaItem}>📍 {position}</Text>
        <Text style={styles.metaItem}>
          📏 {(component.width * 100).toFixed(1)}% × {(component.height * 100).toFixed(1)}%
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.sm,
  },
  badgeText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 12,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  confidence: {
    ...typography.caption,
    color: colors.primary,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    fontWeight: '600',
  },
  description: {
    ...typography.body,
    color: colors.textLight,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaItem: {
    ...typography.caption,
    color: colors.textLight,
  },
});