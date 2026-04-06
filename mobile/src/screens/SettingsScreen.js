import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { spacing, getPalette } from '../styles/theme';

export default function SettingsScreen() {
  const { clearChat, clearDocument, clearAllHistory, accessibilitySettings, setDarkMode } = useMobileDocumentContext();
  const [notifications, setNotifications] = useState(true);
  const { data: healthData, loading: healthLoading, error: healthError, check: handleCheckHealth } = useHealthCheck();
  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);

  const handleClearHistory = () => {
    Alert.alert(
      'Clear All History',
      'This will remove all sessions, chat history and loaded documents.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearChat();
            clearDocument();
            if (clearAllHistory) clearAllHistory();
          },
        },
      ],
    );
  };

  const SectionCard = ({ children, style }) => (
    <View style={[styles.card, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }, style]}>
      {children}
    </View>
  );

  const RowDivider = () => (
    <View style={[styles.divider, { backgroundColor: p.border }]} />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: p.text }]}>Settings</Text>

        {/* App info */}
        <SectionCard>
          <View style={styles.appRow}>
            <View style={[styles.appIcon, { backgroundColor: p.primaryGlass, borderColor: p.borderTop }]}>
              <Ionicons name="layers-outline" size={28} color={p.primary} />
            </View>
            <View style={styles.appInfo}>
              <Text style={[styles.appName, { color: p.text }]}>Diagram Analyser</Text>
              <Text style={[styles.appSub, { color: p.subtext }]}>AI-powered diagram analysis</Text>
            </View>
          </View>
        </SectionCard>

        {/* Preferences */}
        <Text style={[styles.sectionHeader, { color: p.subtext }]}>PREFERENCES</Text>
        <SectionCard>
          <View style={styles.settingRow}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(255,159,10,0.15)' }]}>
              <Ionicons name="notifications-outline" size={18} color="#FF9F0A" />
            </View>
            <Text style={[styles.settingLabel, { color: p.text }]}>Notifications</Text>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: p.border, true: p.primary }}
              thumbColor="#fff"
              ios_backgroundColor={p.cardSoftAbs}
            />
          </View>
          <RowDivider />
          <View style={styles.settingRow}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(94,92,230,0.15)' }]}>
              <Ionicons name="moon-outline" size={18} color="#5E5CE6" />
            </View>
            <Text style={[styles.settingLabel, { color: p.text }]}>Dark Mode</Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: p.border, true: p.primary }}
              thumbColor="#fff"
              ios_backgroundColor={p.cardSoftAbs}
            />
          </View>
        </SectionCard>

        {/* Data */}
        <Text style={[styles.sectionHeader, { color: p.subtext }]}>DATA</Text>
        <SectionCard>
          <TouchableOpacity style={styles.settingRow} onPress={handleClearHistory} activeOpacity={0.7}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(255,69,58,0.15)' }]}>
              <Ionicons name="trash-outline" size={18} color={p.error} />
            </View>
            <Text style={[styles.settingLabel, { color: p.error }]}>Clear All History</Text>
            <Ionicons name="chevron-forward" size={16} color={p.muted} />
          </TouchableOpacity>
        </SectionCard>

        {/* Backend */}
        <Text style={[styles.sectionHeader, { color: p.subtext }]}>BACKEND</Text>
        <SectionCard>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleCheckHealth}
            activeOpacity={0.7}
            disabled={healthLoading}
          >
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(41,151,255,0.15)' }]}>
              {healthLoading
                ? <ActivityIndicator size="small" color={p.primary} />
                : <Ionicons name="pulse-outline" size={18} color={p.primary} />}
            </View>
            <Text style={[styles.settingLabel, { color: p.text }]}>Check Backend Health</Text>
            {!healthLoading && <Ionicons name="chevron-forward" size={16} color={p.muted} />}
          </TouchableOpacity>

          {/* Error state */}
          {healthError && (
            <>
              <RowDivider />
              <View style={[styles.healthResult, { backgroundColor: 'rgba(255,69,58,0.08)' }]}>
                <Ionicons name="alert-circle-outline" size={16} color={p.error} />
                <Text style={[styles.healthErrorText, { color: p.error }]}>{healthError}</Text>
              </View>
            </>
          )}

          {/* Success state */}
          {healthData && (
            <>
              <RowDivider />
              <View style={styles.healthResult}>
                {/* Status + mode row */}
                <View style={styles.healthTopRow}>
                  <View style={[
                    styles.healthStatusBadge,
                    { backgroundColor: healthData.status === 'healthy' ? 'rgba(48,209,88,0.15)' : 'rgba(255,159,10,0.15)' },
                  ]}>
                    <Ionicons
                      name={healthData.status === 'healthy' ? 'checkmark-circle' : 'warning'}
                      size={13}
                      color={healthData.status === 'healthy' ? p.success : '#FF9F0A'}
                    />
                    <Text style={[
                      styles.healthStatusText,
                      { color: healthData.status === 'healthy' ? p.success : '#FF9F0A' },
                    ]}>
                      {healthData.status?.toUpperCase()}
                    </Text>
                  </View>
                  {healthData.mode && (
                    <View style={[styles.healthModeBadge, { backgroundColor: p.primaryGlass }]}>
                      <Text style={[styles.healthModeText, { color: p.primary }]}>{healthData.mode}</Text>
                    </View>
                  )}
                </View>

                {/* Models */}
                {healthData.models && Object.keys(healthData.models).length > 0 && (
                  <View style={styles.healthModels}>
                    {Object.entries(healthData.models).map(([name, info]) => {
                      if (typeof info !== 'object' || info === null) return null;
                      const loaded = info.loaded === true;
                      return (
                        <View key={name} style={[styles.healthModelRow, { borderColor: p.border }]}>
                          <Ionicons
                            name={loaded ? 'checkmark-circle-outline' : 'close-circle-outline'}
                            size={14}
                            color={loaded ? p.success : p.error}
                          />
                          <Text style={[styles.healthModelName, { color: p.text }]}>
                            {name.charAt(0).toUpperCase() + name.slice(1)}
                          </Text>
                          <Text style={[styles.healthModelStatus, { color: loaded ? p.success : p.error }]}>
                            {loaded ? 'Loaded' : 'Not loaded'}
                          </Text>
                          {info.note && (
                            <Text style={[styles.healthModelNote, { color: p.muted }]} numberOfLines={1}>
                              {info.note}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}
        </SectionCard>

        {/* About */}
        <Text style={[styles.sectionHeader, { color: p.subtext }]}>ABOUT</Text>
        <SectionCard>
          <View style={styles.settingRow}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(48,209,88,0.15)' }]}>
              <Ionicons name="information-circle-outline" size={18} color={p.success} />
            </View>
            <Text style={[styles.settingLabel, { color: p.text }]}>Version</Text>
            <Text style={[styles.settingValue, { color: p.subtext }]}>v1.0.1</Text>
          </View>
          <RowDivider />
          <View style={styles.settingRow}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(41,151,255,0.15)' }]}>
              <Ionicons name="hardware-chip-outline" size={18} color={p.primary} />
            </View>
            <Text style={[styles.settingLabel, { color: p.text }]}>AI Model</Text>
            <Text style={[styles.settingValue, { color: p.subtext }]}>Granite Vision</Text>
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },

  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },

  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  card: {
    marginHorizontal: spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },

  /* App info row */
  appRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 14 },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  appInfo: { flex: 1 },
  appName: { fontSize: 18, fontWeight: '700', marginBottom: 3 },
  appSub: { fontSize: 13 },

  /* Setting rows */
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    gap: 12,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  settingValue: { fontSize: 14 },

  divider: { height: StyleSheet.hairlineWidth, marginLeft: 56 },

  /* Health check result */
  healthResult: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 10,
  },
  healthTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  healthStatusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  healthModeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  healthModeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  healthModels: {
    gap: 6,
  },
  healthModelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  healthModelName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  healthModelStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  healthModelNote: {
    fontSize: 11,
    width: '100%',
    marginTop: 1,
  },
  healthErrorText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
