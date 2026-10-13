import { Text, View } from 'react-native';
import globalStyles from '../styles/globalStyles';

// Ska inte registreras i navigatorn förrän riktig autentisering finns.
export default function MyReviewsScreen() {
  return (
    <View style={globalStyles.placeholderContainer}>
      <Text style={globalStyles.title}>Mina recensioner</Text>
      <Text style={globalStyles.text}>Här kommer dina recensioner att visas när inloggning finns.</Text>
    </View>
  );
}
