import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './src/styles/theme';
// Context & Screens
import { HistoryProvider } from './src/context/HistoryContext';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import UploadScreen from './src/screens/UploadScreen';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DocumentScreen from './src/screens/DocumentScreen';
import ARScreen from './src/screens/ARScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'HomeMain') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Chat') {
            iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      {/* Added options={{ title: 'Home' }} so the tab label reads "Home" instead of "HomeMain" */}
      <Tab.Screen 
        name="HomeMain" 
        component={HomeScreen} 
        options={{ title: 'Home' }} 
      />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <HistoryProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.background, shadowColor: 'transparent', elevation: 0 },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
            headerBackTitleVisible: false,
            cardStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Home" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="Scan" component={CameraScreen} />
          <Stack.Screen name="Upload" component={UploadScreen} />
          <Stack.Screen name="DocumentScreen" component={DocumentScreen} options={{ title: 'Document Analysis' }} />
          <Stack.Screen name="ARScreen" component={ARScreen} options={{ title: 'AR Visualization', headerShown: false }} />
          <Stack.Screen name="ChatFull" component={ChatScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </HistoryProvider>
  );
}