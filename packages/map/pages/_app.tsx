import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { GoogleTagManager } from '@next/third-parties/google'
import { ThemeProvider, useTheme } from 'contexts/ThemeContext'
import { mantineTheme } from 'common';
import { MantineProvider } from '@mantine/core'
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

type MantineProps = {
  children: string | JSX.Element | JSX.Element[]
}

function Mantine({ children }: MantineProps) {

  const { theme } = useTheme();

  return <MantineProvider theme={mantineTheme}    forceColorScheme={theme}>
    {children}
  </MantineProvider>
}
