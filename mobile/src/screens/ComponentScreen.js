import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import ComponentCard from '../components/ComponentCard';
import { spacing, getPalette } from '../styles/theme';

const SORT_OPTIONS = [
  { id: 'confidence', label: 'Confidence' },
  { id: 'label', label: 'Name' },
  { id: 'position', label: 'Position' },
];

export default function ComponentsScreen({ navigation }) {
  const { document, accessibilitySettings } = useDocumentContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('confidence');
  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);

  useEffect(() => {
    if (!document) navigation.popToTop();
  }, [document, navigation]);

  if (!document) return null;

  const components = document.ar?.components || [];

  const filtered = components.filter((c) =>
    c.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'confidence') return b.confidence - a.confidence;
    if (sortBy === 'label') return a.label.localeCompare(b.label);
    return a.y - b.y || a.x - b.x;
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: p.bg, borderBottomColor: p.border }]}>
        <View style={[styles.searchField, { backgroundColor: p.cardAbs, borderColor: p.border }]}>
          <Ionicons name="search-outline" size={16} color={p.subtext} style={{ marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: p.text }]}
            placeholder="Search components…"
            placeholderTextColor={p.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Sort + count row */}
      <View style={[styles.controlRow, { backgroundColor: p.bg, borderBottomColor: p.border }]}>
        <View style={[styles.sortGroup, { backgroundColor: p.cardAbs, borderColor: p.border }]}>
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.sortPill, active && { backgroundColor: p.primary }]}
                onPress={() => setSortBy(opt.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sortPillText, { color: active ? '#fff' : p.subtext }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.countText, { color: p.muted }]}>
          {sorted.length}/{components.length}
        </Text>
      </View>

      {/* List */}
      {sorted.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={48} color={p.muted} />
          <Text style={[styles.emptyTitle, { color: p.text }]}>No components found</Text>
          <Text style={[styles.emptyHint, { color: p.subtext }]}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ComponentCard
              component={item}
              index={index}
              onPress={() => navigation.navigate('Diagram', { selectedComponent: item })}
              palette={p}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },

  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  sortGroup: {
    flexDirection: 'row',
    borderRadius: 100,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  sortPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
  },
  sortPillText: { fontSize: 13, fontWeight: '600' },
  countText: { fontSize: 12, fontWeight: '600' },

  listContent: { padding: spacing.lg },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyHint: { fontSize: 14 },
});
