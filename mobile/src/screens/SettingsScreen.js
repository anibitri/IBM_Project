import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
// Replaced @expo/vector-icons
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';
import { spacing } from '../styles/theme';

export default function SettingsScreen() {
  const {
    clearChat,
    clearDocument,
    accessibilitySettings,
    setDarkMode,
  } = useMobileDocumentContext();
  const [notifications, setNotifications] = useState(true);
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

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'This will remove all chat history and loaded documents. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearChat();
            clearDocument();
            Alert.alert('Done', 'History cleared successfully.');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
    <ScrollView style={[styles.container, { backgroundColor: palette.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: palette.text }]}>Settings</Text>

      {/* Profile Card */}
      <View style={[styles.card, { backgroundColor: palette.card }]}> 
        <View style={styles.profileRow}>
          <View style={[styles.avatarCircle, { backgroundColor: darkMode ? '#242a31' : '#e0e0e0' }]}> 
            <Ionicons name="person-outline" size={28} color={palette.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: palette.text }]}>Admin User</Text>
            <Text style={[styles.profileEmail, { color: palette.subtext }]}>admin@example.com</Text>
          </View>
        </View>
      </View>

      {/* Preferences */}
      <View style={[styles.card, { backgroundColor: palette.card }]}> 
        <Text style={[styles.sectionLabel, { color: palette.subtext }]}>PREFERENCES</Text>
        <View style={styles.settingRow}>
          <Ionicons name="notifications-outline" size={22} color={palette.text} style={styles.settingIcon} />
          <Text style={[styles.settingText, { color: palette.text }]}>Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#e0e0e0', true: '#4cd964' }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <View style={styles.settingRow}>
          <Ionicons name="moon-outline" size={22} color={palette.text} style={styles.settingIcon} />
          <Text style={[styles.settingText, { color: palette.text }]}>Dark Mode</Text>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: '#e0e0e0', true: '#4cd964' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Data */}
      <View style={[styles.card, { backgroundColor: palette.card }]}> 
        <Text style={[styles.sectionLabel, { color: palette.subtext }]}>DATA</Text>
        <TouchableOpacity style={styles.settingRow} onPress={handleClearHistory}>
          <Ionicons name="trash-outline" size={22} color="#ff3b30" style={styles.settingIcon} />
          <Text style={[styles.settingText, { color: palette.text }]}>Clear History</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.version, { color: palette.subtext }]}>Prototype v0.1.0</Text>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  title: { fontSize: 34, fontWeight: '800', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: 14, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '600', paddingVertical: spacing.sm, letterSpacing: 0.5 },
  profileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  profileInfo: { marginLeft: spacing.md },
  profileName: { fontSize: 20, fontWeight: '700' },
  profileEmail: { fontSize: 14, marginTop: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  settingIcon: { marginRight: 14 },
  settingText: { flex: 1, fontSize: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 40 },
  version: { textAlign: 'center', fontSize: 14, marginTop: spacing.xl },
});