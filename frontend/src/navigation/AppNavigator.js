import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import UploadScreen from '../screens/UploadScreen';
import DocumentScreen from '../screens/DocumentScreen'; // <-- ADDED
import ARScreen from '../screens/ARScreen';             // <-- ADDED

// Context
import { HistoryProvider } from '../context/HistoryContext';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <HistoryProvider>
      {/* FIX: Changed "Home" to "HomeMain" to match the screen name exactly */}
      <Stack.Navigator initialRouteName="HomeMain">
        
        <Stack.Screen 
            name="HomeMain" 
            component={HomeScreen} 
            options={{ title: 'Home' }} 
        />
        
        <Stack.Screen 
            name="Scan" 
            component={CameraScreen} 
            options={{ title: 'Scan Document' }} 
        />
        
        <Stack.Screen 
            name="Upload" 
            component={UploadScreen} 
            options={{ title: 'Upload Document' }} 
        />

        {/* --- NEW SCREENS WE BUILT --- */}
        <Stack.Screen 
            name="DocumentScreen" 
            component={DocumentScreen} 
            options={{ title: 'Document Details' }} 
        />

        <Stack.Screen 
            name="ARScreen" 
            component={ARScreen} 
            options={{ title: 'AR Visualization' }} 
        />

      </Stack.Navigator>
    </HistoryProvider>
  );
}