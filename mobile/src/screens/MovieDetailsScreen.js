import { Text, View } from 'react-native';
import globalStyles from '../styles/globalStyles';

export default function MovieDetailsScreen({ route }) {
  // Framtida navigation: navigate('MovieDetails', { movieId: filmensId }).
  const movieId = route.params?.movieId;
  let movieIdInfo = null;
  if (movieId !== undefined) {
    movieIdInfo = <Text style={globalStyles.text}>Film-ID: {movieId}</Text>;
  }

  return (
    <View style={globalStyles.placeholderContainer}>
      <Text style={globalStyles.title}>Filmdetaljer</Text>
      <Text style={globalStyles.text}>Här kommer filminformation och recensioner att visas.</Text>
      {movieIdInfo}
    </View>
  );
}
