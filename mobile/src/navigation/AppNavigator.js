import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';
import { getPalette } from '../styles/theme';

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

const TAB_ICONS = {
  Home: { outline: 'home-outline', filled: 'home' },
  Chat: { outline: 'chatbubble-outline', filled: 'chatbubble' },
  Settings: { outline: 'settings-outline', filled: 'settings' },
};

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
        options={{ headerShown: true, title: 'Diagram', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Components"
        component={ComponentsScreen}
        options={{ headerShown: true, title: 'Components', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="ARMock"
        component={ARMockScreen}
        options={{ headerShown: true, title: 'AR Preview', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="AR"
        component={ARScreen}
        options={{ headerShown: true, title: 'AR Camera', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
}

function ChatStack({ stackOptions }) {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="ChatMain" component={ChatScreen} />
    </Stack.Navigator>
  );
}

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
  const p = getPalette(darkMode);

  const navTheme = darkMode
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: p.bg,
          card: p.cardAbs,
          border: p.border,
          text: p.text,
          primary: p.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: p.bg,
          card: p.card,
          border: p.border,
          text: p.text,
          primary: p.primary,
        },
      };

  const stackOptions = {
    headerShown: false,
    headerStyle: { backgroundColor: p.cardAbs },
    headerTintColor: p.primary,
    headerTitleStyle: { color: p.text, fontWeight: '600' },
    contentStyle: { backgroundColor: p.bg },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? TAB_ICONS[route.name]?.filled : TAB_ICONS[route.name]?.outline}
              size={24}
              color={color}
            />
          ),
          tabBarActiveTintColor: p.primary,
          tabBarInactiveTintColor: p.muted,
          tabBarStyle: {
            backgroundColor: darkMode ? p.cardAbs : p.card,
            borderTopWidth: 1,
            borderTopColor: darkMode ? p.border : p.border,
            paddingBottom: 14,
            paddingTop: 8,
            height: 70,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginBottom: 2,
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
