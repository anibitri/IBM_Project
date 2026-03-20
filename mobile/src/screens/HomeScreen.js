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
// Replaced @expo/vector-icons
import Ionicons from 'react-native-vector-icons/Ionicons';
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
    accessibilitySettings,
  } = useMobileDocumentContext();

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
        bg: '#f2f2f7',
        card: '#ffffff',
        border: '#e0e0e0',
        text: '#000000',
        subtext: '#8e8e93',
        primary: '#007AFF',
      };

  const handleUpload = () => {
    navigation.navigate('Upload');
  };

  const handleScan = async () => {
    const ok = await loadDemo();
    if (ok) navigation.navigate('Diagram');
  };

  const handleARCamera = async () => {
    const ok = await loadDemo();
    if (ok) navigation.navigate('Diagram', { cameraMode: true });
  };

  const handleRestore = (session) => {
    restoreSession(session);
    // If session has chat history, go to Chat tab to continue the conversation
    if (session.chatHistory?.length > 0) {
      navigation.getParent()?.navigate('Chat');
    } else {
      navigation.navigate('Diagram');
    }
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}> 
      <ScrollView
        style={[styles.container, { backgroundColor: palette.bg }]}
        contentContainerStyle={styles.content}
      >
        {/* Title area */}
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: palette.text }]}>AR-AI Technical Docs</Text>
          <Text style={[styles.heroSubtitle, { color: palette.subtext }]}>
            Augment and analyze technical documentation{'\n'}with AI
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: palette.primary }]}
            onPress={handleUpload}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
                <Text style={styles.actionBtnText}>Upload</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: palette.primary }]}
            onPress={handleScan}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Ionicons name="scan-outline" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: palette.primary }]}
            onPress={handleARCamera}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Ionicons name="camera-outline" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>AR Camera</Text>
          </TouchableOpacity>
        </View>

        {/* Recent analyses */}
        <View style={styles.recentSection}>
          <Text style={[styles.recentTitle, { color: palette.text }]}>Recent analyses</Text>
          <View style={[styles.recentCard, { backgroundColor: palette.card }]}> 
            {recentSessions && recentSessions.length > 0 ? (
              recentSessions.map((session) => (
                <TouchableOpacity
                  key={session.id}
                  style={[styles.recentItem, { borderBottomColor: palette.border }]}
                  onPress={() => handleRestore(session)}
                  onLongPress={() => handleDelete(session)}
                  activeOpacity={0.7}
                >
                  <View style={styles.recentItemLeft}>
                    <Ionicons name="document-text-outline" size={22} color={palette.primary} style={styles.recentItemIcon} />
                    <View style={styles.recentItemInfo}>
                      <Text style={[styles.recentItemText, { color: palette.text }]} numberOfLines={1}>
                        {session.fileName || 'Untitled'}
                      </Text>
                      <Text style={[styles.recentItemMeta, { color: palette.subtext }]}>
                        {session.componentCount || 0} components
                        {session.messageCount ? ` · ${session.messageCount} messages` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recentItemRight}>
                    <Text style={[styles.recentItemTime, { color: palette.subtext }]}>
                      {session.timestamp ? timeAgo(session.timestamp) : ''}
                    </Text>
                    <Text style={[styles.recentItemChevron, { color: palette.subtext }]}>›</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={[styles.recentEmpty, { color: palette.subtext }]}>No analyses yet.</Text>
            )}
          </View>
          {recentSessions && recentSessions.length > 0 && (
            <Text style={[styles.recentHint, { color: palette.subtext }]}>Long-press to remove</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ... styles remain the same
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  content: { paddingBottom: 40, alignItems: 'center' },
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: 32, paddingHorizontal: spacing.lg },
  heroTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  heroSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: spacing.lg, marginBottom: 40 },
  actionBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  recentSection: { width: '100%', paddingHorizontal: spacing.lg },
  recentTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  recentCard: { borderRadius: 14, padding: spacing.md, minHeight: 60, justifyContent: 'center' },
  recentEmpty: { textAlign: 'center', fontSize: 15, paddingVertical: 8 },
  recentItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  recentItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  recentItemIcon: { marginRight: 12 },
  recentItemInfo: { flex: 1 },
  recentItemText: { fontSize: 16, fontWeight: '600' },
  recentItemMeta: { fontSize: 13, marginTop: 2 },
  recentItemRight: { alignItems: 'flex-end' },
  recentItemTime: { fontSize: 12, marginBottom: 2 },
  recentItemChevron: { fontSize: 20, fontWeight: '300' },
  recentHint: { textAlign: 'center', fontSize: 12, marginTop: 8 },
});