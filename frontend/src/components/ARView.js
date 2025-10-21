import React from 'react';
import { View, Text } from 'react-native';
import { ARKit } from 'react-native-arkit';

export default function ARView() {
    return (
        <ARKit 
        style={{ flex: 1 }}
        planeDetection={ARKit.ARPlaneDetection.Horizontal}
        lightEstimationEnabled
        >
        <ARKit.Text
            text="Scanning..."
            position={{ x: 0, y: 0.1, z: -0.5 }}
            font={{ size: 0.1, depth: 0.02 }}
            color="#007AFF"
        />
        </ARKit>
    );
}
    