import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, SafeAreaView 
} from 'react-native';

// 1. Import the hook
import { useHistory } from '../../../frontend/src/context/HistoryContext';

export default function SettingsScreen({ navigation }) {
  
  // --- 1. DECLARE ALL HOOKS AT THE VERY TOP ---
  // If you don't use the hook here, remove it. But do NOT put it inside an if statement.
  const { clearHistory } = useHistory(); 

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // --- 2. HANDLERS (After hooks, before return) ---
  
  const handleClearHistory = () => {
    Alert.alert(
      "Clear All History",
      "This will permanently delete all chat sessions and uploaded documents.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: () => {
            clearHistory(); // Uses the function from context
            Alert.alert("Success", "History has been wiped.");
          } 
        }
      ]
    );
  };

  const toggleSwitch = () => setNotificationsEnabled(prev => !prev);
  const toggleDarkMode = () => setDarkMode(prev => !prev);

  // --- 3. COMPONENT RENDER ---
  const SettingRow = ({ icon, title, onPress, showArrow = true }) => (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowIcon}>{icon}</Text>
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      {showArrow && <Text style={styles.rowArrow}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Profile Placeholder */}
        <TouchableOpacity style={styles.profileCard} onPress={() => Alert.alert("Profile", "Edit Profile Clicked")}>
          <View style={styles.profileImageContainer}>
            <Text style={styles.profilePlaceholder}>👤</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Admin User</Text>
            <Text style={styles.profileEmail}>admin@example.com</Text>
          </View>
        </TouchableOpacity>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PREFERENCES</Text>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔔</Text>
              <Text style={styles.rowTitle}>Notifications</Text>
            </View>
            <Switch
              trackColor={{ false: "#767577", true: "#34C759" }}
              onValueChange={toggleSwitch}
              value={notificationsEnabled}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🌙</Text>
              <Text style={styles.rowTitle}>Dark Mode</Text>
            </View>
            <Switch
              trackColor={{ false: "#767577", true: "#34C759" }}
              onValueChange={toggleDarkMode}
              value={darkMode}
            />
          </View>
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>DATA</Text>
          <SettingRow 
            icon="🗑️" 
            title="Clear History" 
            onPress={handleClearHistory} 
            showArrow={false}
          />
        </View>

        <Text style={styles.versionText}>Prototype v0.1.0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  scrollContent: { paddingBottom: 40 },
  header: { padding: 20 },
  headerTitle: { fontSize: 32, fontWeight: '700', color: '#000' },
  profileCard: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', padding: 16, marginHorizontal: 16, marginBottom: 24, borderRadius: 12 },
  profileImageContainer: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  profilePlaceholder: { fontSize: 30 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600', color: '#000' },
  profileEmail: { fontSize: 14, color: '#8E8E93' },
  section: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 24, borderRadius: 12, overflow: 'hidden' },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 8, marginLeft: 16, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff' },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  rowIcon: { fontSize: 20, marginRight: 12, width: 24, textAlign: 'center' },
  rowTitle: { fontSize: 16, color: '#000' },
  rowArrow: { fontSize: 18, color: '#C7C7CC', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#E5E5EA', marginLeft: 52 },
  versionText: { textAlign: 'center', color: '#8E8E93', fontSize: 13 },
});