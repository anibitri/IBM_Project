import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
// Replaced @expo/vector-icons with react-native-vector-icons
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors, spacing, typography } from '../styles/theme';

export default function ComponentCard({ component, index, onPress, palette }) {
  const confidencePercent = (component.confidence * 100).toFixed(1);
  const position = `(${(component.x * 100).toFixed(1)}%, ${(component.y * 100).toFixed(1)}%)`;

  const cardBg = palette?.card || colors.white;
  const cardBorder = palette?.border || colors.border;
  const labelColor = palette?.text || colors.text;
  const metaColor = palette?.subtext || colors.textLight;
  const primaryColor = palette?.primary || colors.primary;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: primaryColor }]}>
          <Text style={styles.badgeText}>#{index + 1}</Text>
        </View>
        <View style={styles.headerContent}>
          <Text style={[styles.label, { color: labelColor }]}>{component.label}</Text>
          <Text style={[styles.confidence, { color: primaryColor }]}>{confidencePercent}%</Text>
        </View>
      </View>

      {component.description && (
        <Text style={[styles.description, { color: metaColor }]} numberOfLines={2}>
          {component.description}
        </Text>
      )}

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={13} color={metaColor} />
          <Text style={[styles.metaText, { color: metaColor }]}>{position}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="resize-outline" size={13} color={metaColor} />
          <Text style={[styles.metaText, { color: metaColor }]}>{(component.width * 100).toFixed(1)}% × {(component.height * 100).toFixed(1)}%</Text>
        </View>
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
    marginTop: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.caption,
    color: colors.textLight,
  },
});