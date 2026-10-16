import { Pressable, StyleSheet, Text, View } from 'react-native';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function LoginScreen({ navigation }) {
  return (
    <View style={globalStyles.placeholderContainer}>
      <Text style={globalStyles.title}>Logga in</Text>
      <Text style={[globalStyles.text, styles.message]}>Inloggning kommer i ett senare steg. Du behöver vara inloggad för att se Mina recensioner.</Text>
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={styles.buttonText}>Registrera konto</Text>
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
