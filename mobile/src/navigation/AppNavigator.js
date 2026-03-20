import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// Replaced @expo/vector-icons
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';

import HomeScreen from '../screens/HomeScreen';
import UploadScreen from '../screens/UploadScreen';
import DiagramScreen from '../screens/DiagramScreen';
import ComponentsScreen from '../screens/ComponentScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ARMockScreen from '../mocks/ARMockScreen';

let ARScreen;
try {
  ARScreen = require('../screens/ARScreen').default;
} catch (e) {
  ARScreen = () => null;
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/* ── Icon helpers for tab bar ── */
const TAB_ICONS = {
  Home: { outline: 'home-outline', filled: 'home' },
  Chat: { outline: 'chatbubble-outline', filled: 'chatbubble' },
  Settings: { outline: 'settings-outline', filled: 'settings' },
};

/* ── Home stack ── */
function HomeStack({ stackOptions }) {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
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
      <Stack.Screen
        name="AR"
        component={ARScreen}
        options={{ headerShown: true, title: 'AR Camera', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
}

/* ── Chat stack ── */
function ChatStack({ stackOptions }) {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="ChatMain" component={ChatScreen} />
    </Stack.Navigator>
  );
}

/* ── Settings stack ── */
function SettingsStack({ stackOptions }) {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { accessibilitySettings } = useMobileDocumentContext();
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
        bg: '#ffffff',
        card: '#ffffff',
        border: '#e8e8e8',
        text: '#111111',
        subtext: '#8e8e93',
        primary: '#007AFF',
      };

  const navTheme = darkMode
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: palette.bg,
          card: palette.card,
          border: palette.border,
          text: palette.text,
          primary: palette.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: palette.bg,
          card: palette.card,
          border: palette.border,
          text: palette.text,
          primary: palette.primary,
        },
      };

  const stackOptions = {
    headerShown: false,
    headerStyle: { backgroundColor: palette.card },
    headerTintColor: palette.text,
    headerTitleStyle: { color: palette.text },
    contentStyle: { backgroundColor: palette.bg },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? (TAB_ICONS[route.name]?.filled || 'ellipse') : (TAB_ICONS[route.name]?.outline || 'ellipse-outline')}
              size={24}
              color={focused ? palette.primary : palette.subtext}
            />
          ),
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.subtext,
          tabBarStyle: {
            backgroundColor: palette.card,
            borderTopColor: palette.border,
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
        <Tab.Screen name="Home">
          {() => <HomeStack stackOptions={stackOptions} />}
        </Tab.Screen>
        <Tab.Screen name="Chat">
          {() => <ChatStack stackOptions={stackOptions} />}
        </Tab.Screen>
        <Tab.Screen name="Settings">
          {() => <SettingsStack stackOptions={stackOptions} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}