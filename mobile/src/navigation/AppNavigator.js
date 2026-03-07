import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import UploadScreen from '../screens/UploadScreen';
import DiagramScreen from '../screens/DiagramScreen';
import ComponentsScreen from '../screens/ComponentScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ARMockScreen from '../mocks/ARMockScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/* ── Icon helpers for tab bar ── */
const TAB_ICONS = {
  Home: { outline: 'home-outline', filled: 'home' },
  Chat: { outline: 'chatbubble-outline', filled: 'chatbubble' },
  Settings: { outline: 'settings-outline', filled: 'settings' },
};

function TabIcon({ label, focused }) {
  const icon = TAB_ICONS[label] || { outline: 'ellipse-outline', filled: 'ellipse' };
  return (
    <Ionicons
      name={focused ? icon.filled : icon.outline}
      size={24}
      color={focused ? '#007AFF' : '#8e8e93'}
    />
  );
}

/* ── Home stack (contains upload, diagram, components, AR mock) ── */
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen
        name="Upload"
        component={UploadScreen}
        options={{ headerShown: true, title: 'Upload', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Diagram"
        component={DiagramScreen}
        options={{ headerShown: true, title: 'AR View', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Components"
        component={ComponentsScreen}
        options={{ headerShown: true, title: 'Components', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="ARMock"
        component={ARMockScreen}
        options={{ headerShown: true, title: 'AR Mock Preview', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
}

/* ── Chat stack ── */
function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatMain" component={ChatScreen} />
    </Stack.Navigator>
  );
}

/* ── Settings stack ── */
function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
          tabBarActiveTintColor: '#ff6347',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: '#e8e8e8',
            paddingBottom: 6,
            paddingTop: 6,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeStack} />
        <Tab.Screen name="Chat" component={ChatStack} />
        <Tab.Screen name="Settings" component={SettingsStack} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}