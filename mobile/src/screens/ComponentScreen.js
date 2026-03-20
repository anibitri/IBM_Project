import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import ComponentCard from '../components/ComponentCard';
import { colors, spacing, typography } from '../styles/theme';

export default function ComponentsScreen({ navigation }) {
  const { document, accessibilitySettings } = useDocumentContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('confidence'); // confidence | label | position
  const darkMode = !!accessibilitySettings?.darkMode;
  const palette = darkMode
    ? {
        bg: '#121417',
        card: '#1b1f24',
        border: '#303741',
        text: '#f4f7fb',
        subtext: '#9aa3ad',
        primary: '#4ea3ff',
      }
    : {
        bg: colors.background,
        card: colors.white,
        border: colors.border,
        text: colors.text,
        subtext: colors.textLight,
        primary: colors.primary,
      };

  useEffect(() => {
    if (!document) {
      navigation.popToTop();
    }
  }, [document, navigation]);

  if (!document) {
    return null;
  }

  const components = document.ar?.components || [];

  // Filter components
  const filteredComponents = components.filter((comp) =>
    comp.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort components
  const sortedComponents = [...filteredComponents].sort((a, b) => {
    switch (sortBy) {
      case 'confidence':
        return b.confidence - a.confidence;
      case 'label':
        return a.label.localeCompare(b.label);
      case 'position':
        return a.y - b.y || a.x - b.x;
      default:
        return 0;
    }
  });

  const handleComponentPress = (component) => {
    navigation.navigate('Diagram', { selectedComponent: component });
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}> 
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: palette.card, borderBottomColor: palette.border }]}> 
        <TextInput
          style={[styles.searchInput, { backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }]}
          placeholder="Search components..."
          placeholderTextColor={palette.subtext}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Sort Options */}
      <View style={[styles.sortContainer, { backgroundColor: palette.card, borderBottomColor: palette.border }]}> 
        <Text style={[styles.sortLabel, { color: palette.subtext }]}>Sort by:</Text>
        <TouchableOpacity
          style={[
            styles.sortButton,
            { backgroundColor: darkMode ? '#242a31' : colors.background },
            sortBy === 'confidence' && [styles.sortButtonActive, { backgroundColor: palette.primary }],
          ]}
          onPress={() => setSortBy('confidence')}
        >
          <Text
            style={[
              styles.sortButtonText,
              { color: palette.subtext },
              sortBy === 'confidence' && styles.sortButtonTextActive,
            ]}
          >
            Confidence
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortButton,
            { backgroundColor: darkMode ? '#242a31' : colors.background },
            sortBy === 'label' && [styles.sortButtonActive, { backgroundColor: palette.primary }],
          ]}
          onPress={() => setSortBy('label')}
        >
          <Text
            style={[styles.sortButtonText, { color: palette.subtext }, sortBy === 'label' && styles.sortButtonTextActive]}
          >
            Name
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortButton,
            { backgroundColor: darkMode ? '#242a31' : colors.background },
            sortBy === 'position' && [styles.sortButtonActive, { backgroundColor: palette.primary }],
          ]}
          onPress={() => setSortBy('position')}
        >
          <Text
            style={[styles.sortButtonText, { color: palette.subtext }, sortBy === 'position' && styles.sortButtonTextActive]}
          >
            Position
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.statsBar, { backgroundColor: palette.card, borderBottomColor: palette.border }]}> 
        <Text style={[styles.statsText, { color: palette.subtext }] }>
          Showing {sortedComponents.length} of {components.length} components
        </Text>
      </View>

      {/* Component List */}
      {sortedComponents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={[styles.emptyText, { color: palette.text }]}>No components found</Text>
          <Text style={[styles.emptySubtext, { color: palette.subtext }]}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          data={sortedComponents}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ComponentCard
              component={item}
              index={index}
              onPress={() => handleComponentPress(item)}
              palette={palette}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortLabel: {
    ...typography.body,
    color: colors.textLight,
    marginRight: spacing.sm,
  },
  sortButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    marginRight: spacing.sm,
    backgroundColor: colors.background,
  },
  sortButtonActive: {
    backgroundColor: colors.primary,
  },
  sortButtonText: {
    ...typography.caption,
    color: colors.textLight,
    fontWeight: '600',
  },
  sortButtonTextActive: {
    color: colors.white,
  },
  statsBar: {
    backgroundColor: colors.white,
    padding: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statsText: {
    ...typography.caption,
    color: colors.textLight,
  },
  listContent: {
    padding: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textLight,
  },
});