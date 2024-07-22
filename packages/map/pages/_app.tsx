import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { GoogleTagManager } from '@next/third-parties/google'
import { ThemeProvider, useTheme } from 'contexts/ThemeContext'
import { colorsTuple, createTheme, MantineProvider, MantineThemeOverride, useMantineColorScheme } from '@mantine/core'
import '@mantine/core/styles.css';
import '@mantine/spotlight/styles.css';
import 'mantine-flagpack/styles.css';
import '@mantine/carousel/styles.css';
import { useEffect } from 'react'

export default function Home({ Component, pageProps }: AppProps) {

  return <>
    {process.env.NODE_ENV !== 'development' && <GoogleTagManager gtmId="GTM-TWKQ769Q" />}
    <ThemeProvider>
      <Mantine>
        <Component {...pageProps} />
      </Mantine>
      
    </ThemeProvider>
  </>
}

function Mantine({children}) {
  const mantineTheme: MantineThemeOverride = createTheme({
    headings: { fontFamily: 'Saira' },
    colors: {
      blue: colorsTuple("#55C1F6"),
      orange: colorsTuple("#FF9900"),
      red: colorsTuple("#DF3838"),
    }
  })

  const { theme } = useTheme();

  return <MantineProvider theme={mantineTheme}    forceColorScheme={theme}>
    {children}
  </MantineProvider>
}
