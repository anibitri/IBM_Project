import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useDocumentContext } from '@ar-viewer/shared';
import ComponentCard from '../components/ComponentCard';
import { colors, spacing, typography } from '../styles/theme';

export default function ComponentsScreen({ navigation }) {
  const { document } = useDocumentContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('confidence'); // confidence | label | position

  if (!document) {
    navigation.replace('Upload');
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
    navigation.navigate('Diagram');
    // Could also pass component to highlight it
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search components..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'confidence' && styles.sortButtonActive]}
          onPress={() => setSortBy('confidence')}
        >
          <Text
            style={[
              styles.sortButtonText,
              sortBy === 'confidence' && styles.sortButtonTextActive,
            ]}
          >
            Confidence
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'label' && styles.sortButtonActive]}
          onPress={() => setSortBy('label')}
        >
          <Text
            style={[styles.sortButtonText, sortBy === 'label' && styles.sortButtonTextActive]}
          >
            Name
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'position' && styles.sortButtonActive]}
          onPress={() => setSortBy('position')}
        >
          <Text
            style={[styles.sortButtonText, sortBy === 'position' && styles.sortButtonTextActive]}
          >
            Position
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          Showing {sortedComponents.length} of {components.length} components
        </Text>
      </View>

      {/* Component List */}
      {sortedComponents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>No components found</Text>
          <Text style={styles.emptySubtext}>Try a different search term</Text>
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