import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';
import { colors, spacing } from '../styles/theme';

export default function SettingsScreen() {
  const { clearChat, clearDocument } = useMobileDocumentContext();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* Profile Card */}
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person-outline" size={28} color="#007AFF" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Admin User</Text>
            <Text style={styles.profileEmail}>admin@example.com</Text>
          </View>
        </View>
      </View>

      {/* Preferences */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.settingRow}>
          <Ionicons name="notifications-outline" size={22} color="#333" style={styles.settingIcon} />
          <Text style={styles.settingText}>Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#e0e0e0', true: '#4cd964' }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <Ionicons name="moon-outline" size={22} color="#333" style={styles.settingIcon} />
          <Text style={styles.settingText}>Dark Mode</Text>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: '#e0e0e0', true: '#4cd964' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Data */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>DATA</Text>
        <TouchableOpacity style={styles.settingRow} onPress={handleClearHistory}>
          <Ionicons name="trash-outline" size={22} color="#ff3b30" style={styles.settingIcon} />
          <Text style={styles.settingText}>Clear History</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Prototype v0.1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    paddingBottom: 40,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#000',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 14,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    paddingVertical: spacing.sm,
    letterSpacing: 0.5,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarIcon: {
    fontSize: 28,
  },
  profileInfo: {
    marginLeft: spacing.md,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  profileEmail: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  settingText: {
    flex: 1,
    fontSize: 17,
    color: '#000',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e0e0e0',
    marginLeft: 40,
  },
  version: {
    textAlign: 'center',
    color: '#8e8e93',
    fontSize: 14,
    marginTop: spacing.xl,
  },
});
