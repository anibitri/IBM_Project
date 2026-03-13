import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';
import { spacing } from '../styles/theme';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function HomeScreen({ navigation }) {
  const {
    document,
    loading,
    loadDemo,
    recentSessions,
    restoreSession,
    removeSession,
  } = useMobileDocumentContext();

  const handleUpload = () => {
    navigation.navigate('Upload');
  };

  const handleScan = async () => {
    await loadDemo();
    navigation.navigate('Diagram');
  };

  const handleRestore = (session) => {
    restoreSession(session);
    navigation.navigate('Diagram');
  };

  const handleDelete = (session) => {
    Alert.alert(
      'Remove Session',
      `Remove "${session.fileName}" from history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeSession(session.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Title area */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>AR-AI Technical Docs</Text>
          <Text style={styles.heroSubtitle}>
            Augment and analyze technical documentation{'\n'}with AI
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleUpload}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Upload</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleScan}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Recent analyses */}
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent analyses</Text>
          <View style={styles.recentCard}>
            {recentSessions && recentSessions.length > 0 ? (
              recentSessions.map((session) => (
                <TouchableOpacity
                  key={session.id}
                  style={styles.recentItem}
                  onPress={() => handleRestore(session)}
                  onLongPress={() => handleDelete(session)}
                  activeOpacity={0.7}
                >
                  <View style={styles.recentItemLeft}>
                    <Ionicons name="document-text-outline" size={22} color="#007AFF" style={styles.recentItemIcon} />
                    <View style={styles.recentItemInfo}>
                      <Text style={styles.recentItemText} numberOfLines={1}>
                        {session.fileName || 'Untitled'}
                      </Text>
                      <Text style={styles.recentItemMeta}>
                        {session.componentCount || 0} components
                        {session.messageCount ? ` · ${session.messageCount} messages` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recentItemRight}>
                    <Text style={styles.recentItemTime}>
                      {session.timestamp ? timeAgo(session.timestamp) : ''}
                    </Text>
                    <Text style={styles.recentItemChevron}>›</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.recentEmpty}>No analyses yet.</Text>
            )}
          </View>
          {recentSessions && recentSessions.length > 0 && (
            <Text style={styles.recentHint}>Long-press to remove</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: spacing.lg,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: spacing.lg,
    marginBottom: 40,
  },
  actionBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
    minWidth: 140,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  recentSection: {
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  recentTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    minHeight: 60,
    justifyContent: 'center',
  },
  recentEmpty: {
    textAlign: 'center',
    color: '#c7c7cc',
    fontSize: 15,
    paddingVertical: 8,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  recentItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  recentItemIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  recentItemInfo: {
    flex: 1,
  },
  recentItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  recentItemMeta: {
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 2,
  },
  recentItemRight: {
    alignItems: 'flex-end',
  },
  recentItemTime: {
    fontSize: 12,
    color: '#8e8e93',
    marginBottom: 2,
  },
  recentItemChevron: {
    fontSize: 20,
    color: '#c7c7cc',
    fontWeight: '300',
  },
  recentHint: {
    textAlign: 'center',
    color: '#c7c7cc',
    fontSize: 12,
    marginTop: 8,
  },
});
