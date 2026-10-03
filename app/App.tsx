import { Text, View } from 'react-native';
import { injectGlobalStyles } from './src/ui/globalStyles';

injectGlobalStyles();

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Personal Sprint</Text>
    </View>
  );
}
