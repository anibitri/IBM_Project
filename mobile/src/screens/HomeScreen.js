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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';
import { timeAgo } from '@ar-viewer/shared';
import { spacing, getPalette } from '../styles/theme';

export default function HomeScreen({ navigation }) {
  const {
    loading,
    loadDemo,
    clearDocument,
    recentSessions,
    restoreSession,
    removeSession,
    accessibilitySettings,
  } = useMobileDocumentContext();

  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);

  const handleUpload = () => navigation.navigate('Upload');

  const handleDemo = async () => {
    const ok = await loadDemo();
    if (ok) navigation.navigate('Diagram');
  };

  const handleARCamera = () => {
    // Always start a fresh session for live AR — previous document/chat cleared.
    // Scanned results will be auto-saved to history via upsertSession after the scan completes.
    clearDocument();
    navigation.navigate('Diagram', { cameraMode: true });
  };

  const handleRestore = (session) => {
    restoreSession(session);
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
        { text: 'Remove', style: 'destructive', onPress: () => removeSession(session.id) },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
      <ScrollView
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={[styles.heroIconWrap, { backgroundColor: p.primaryGlass, borderColor: p.borderTop }]}>
            <Ionicons name="layers-outline" size={36} color={p.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: p.text }]}>Diagram Analyser</Text>
          <Text style={[styles.heroSubtitle, { color: p.subtext }]}>
            Upload technical diagrams for AI-powered{'\n'}component detection and analysis
          </Text>
        </View>

        {/* ── Primary action ── */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: p.primary }]}
          onPress={handleUpload}
          activeOpacity={0.82}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
              <Text style={styles.primaryBtnText}>Upload Diagram</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Secondary actions row ── */}
        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}
            onPress={handleDemo}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Ionicons name="play-circle-outline" size={22} color={p.primary} />
            <Text style={[styles.secondaryBtnText, { color: p.text }]}>Demo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}
            onPress={handleARCamera}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Ionicons name="camera-outline" size={22} color={p.primary} />
            <Text style={[styles.secondaryBtnText, { color: p.text }]}>AR Camera</Text>
          </TouchableOpacity>
        </View>

        {/* ── Capability pills ── */}
        <View style={styles.capabilityRow}>
          {[
            { icon: 'search-outline', label: 'Component Detection' },
            { icon: 'chatbubble-ellipses-outline', label: 'AI Q&A' },
            { icon: 'cube-outline', label: '3D AR View' },
          ].map((cap) => (
            <View key={cap.label} style={[styles.capPill, { backgroundColor: p.cardAbs, borderColor: p.border }]}>
              <Ionicons name={cap.icon} size={14} color={p.primary} />
              <Text style={[styles.capPillText, { color: p.subtext }]}>{cap.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Recent Sessions ── */}
        <View style={styles.recentSection}>
          <Text style={[styles.sectionLabel, { color: p.text }]}>Recent</Text>

          {recentSessions && recentSessions.length > 0 ? (
            <View style={[styles.recentCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
              {recentSessions.map((session, idx) => (
                <TouchableOpacity
                  key={session.id}
                  style={[
                    styles.recentItem,
                    { borderBottomColor: p.border },
                    idx === recentSessions.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => handleRestore(session)}
                  onLongPress={() => handleDelete(session)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.recentIcon, { backgroundColor: p.primaryGlass }]}>
                    <Ionicons name="document-text-outline" size={18} color={p.primary} />
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={[styles.recentName, { color: p.text }]} numberOfLines={1}>
                      {session.fileName || 'Untitled'}
                    </Text>
                    <Text style={[styles.recentMeta, { color: p.subtext }]}>
                      {session.componentCount || 0} components
                      {session.messageCount ? ` · ${session.messageCount} messages` : ''}
                    </Text>
                  </View>
                  <View style={styles.recentRight}>
                    <Text style={[styles.recentTime, { color: p.muted }]}>
                      {session.timestamp ? timeAgo(session.timestamp) : ''}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={p.muted} style={{ marginTop: 2 }} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: p.cardAbs, borderColor: p.border }]}>
              <Ionicons name="folder-open-outline" size={32} color={p.muted} />
              <Text style={[styles.emptyText, { color: p.subtext }]}>No analyses yet</Text>
              <Text style={[styles.emptyHint, { color: p.muted }]}>Upload a diagram to get started</Text>
            </View>
          )}

          {recentSessions?.length > 0 && (
            <Text style={[styles.hintText, { color: p.muted }]}>Long-press a session to remove it</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingBottom: 48 },

  /* Hero */
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: 28, paddingHorizontal: spacing.lg },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
  },
  heroTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' },
  heroSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

  /* Primary CTA */
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    paddingVertical: 16,
    borderRadius: 100,
    marginBottom: 12,
    shadowColor: '#2997ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },

  /* Secondary CTAs */
  secondaryRow: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.lg, marginBottom: 20 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },

  /* Capability pills */
  capabilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginBottom: 28,
    justifyContent: 'center',
  },
  capPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  capPillText: { fontSize: 12, fontWeight: '600' },

  /* Recent */
  recentSection: { paddingHorizontal: spacing.lg },
  sectionLabel: { fontSize: 22, fontWeight: '700', marginBottom: 12, letterSpacing: -0.3 },
  recentCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recentInfo: { flex: 1, marginRight: 8 },
  recentName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  recentMeta: { fontSize: 12 },
  recentRight: { alignItems: 'flex-end' },
  recentTime: { fontSize: 12, marginBottom: 2 },

  /* Empty state */
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 13 },

  hintText: { fontSize: 12, textAlign: 'center', marginTop: 10 },
});
