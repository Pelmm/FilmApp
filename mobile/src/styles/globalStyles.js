import { StyleSheet } from 'react-native';
import colors from './colors';
import fonts from './fonts';

const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  placeholderContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'center',
  },

  title: {
    color: colors.primaryText,
    fontSize: fonts.sizes.title,
    fontWeight: fonts.weights.bold,
    marginBottom: 16,
  },

  text: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    lineHeight: 24,
  },
});

export default globalStyles;
