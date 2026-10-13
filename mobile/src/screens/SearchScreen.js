import { Text, View } from 'react-native';
import globalStyles from '../styles/globalStyles';

export default function SearchScreen() {
  return (
    <View style={globalStyles.placeholderContainer}>
      <Text style={globalStyles.title}>Sök filmer</Text>
      <Text style={globalStyles.text}>Här kommer du kunna söka efter filmer.</Text>
    </View>
  );
}
