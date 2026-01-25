import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
// Context & Screens
import { HistoryProvider } from './src/context/HistoryContext';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import UploadScreen from './src/screens/UploadScreen';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DocumentScreen from './src/screens/DocumentScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: 'tomato',
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          // FIX: Check for 'HomeMain' instead of 'Home'
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
        <Stack.Navigator>
          <Stack.Screen name="Home" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="Scan" component={CameraScreen} />
          <Stack.Screen name="Upload" component={UploadScreen} />
          <Stack.Screen name="DocView" component={DocumentScreen} options={{ title: 'Document Analysis' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </HistoryProvider>
  );
}