import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { GoogleTagManager } from '@next/third-parties/google'
import { ThemeProvider } from 'contexts/ThemeContext'
import { colorsTuple, createTheme, MantineProvider, MantineThemeOverride } from '@mantine/core'
import '@mantine/core/styles.css';
import '@mantine/spotlight/styles.css';
import 'mantine-flagpack/styles.css';

export default function Home({ Component, pageProps }: AppProps) {


  const mantineTheme: MantineThemeOverride = createTheme({
    headings: { fontFamily: 'Saira' },
    colors: {
      blue: colorsTuple("#55C1F6"),
      orange: colorsTuple("#FF9900"),
      red: colorsTuple("#DF3838"),
    }
  })

  return <>
    {process.env.NODE_ENV !== 'development' && <GoogleTagManager gtmId="GTM-TWKQ769Q" />}
    <ThemeProvider>
      <MantineProvider theme={mantineTheme} defaultColorScheme="dark">
        <Component {...pageProps} />
      </MantineProvider>
    </ThemeProvider>
  </>
}
