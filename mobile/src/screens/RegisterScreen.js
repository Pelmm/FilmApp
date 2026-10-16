import { Pressable, StyleSheet, Text, View } from 'react-native';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function RegisterScreen({ navigation }) {
  return (
    <View style={globalStyles.placeholderContainer}>
      <Text style={globalStyles.title}>Registrera konto</Text>
      <Text style={[globalStyles.text, styles.message]}>Registrering kommer i ett senare steg.</Text>
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>Tillbaka till inloggning</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    marginBottom: 24
  },

  button: {
    backgroundColor: colors.accent,
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },

  buttonText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
    textAlign: 'center'
  },
});
