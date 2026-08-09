import { StyleSheet } from 'react-native';
import { BRAND_TEAL, colors, fonts } from '../../constants/theme';

export const authStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandCream },
  stepBody: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.black,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 28,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.black,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  inputError: {
    borderColor: colors.brandCoral,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.brandCoral,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: BRAND_TEAL,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.white,
  },
  secondaryBtn: {
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  secondaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: BRAND_TEAL,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 12,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  link: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: BRAND_TEAL,
  },
  muted: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
});
