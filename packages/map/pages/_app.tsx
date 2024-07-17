import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { GoogleTagManager } from '@next/third-parties/google'
import { ThemeProvider } from 'contexts/ThemeContext'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css';
import '@mantine/spotlight/styles.css';

export default function Home({ Component, pageProps }: AppProps) {


  return <>
    {process.env.NODE_ENV !== 'development' && <GoogleTagManager gtmId="GTM-TWKQ769Q" />}
    <ThemeProvider>
      <MantineProvider defaultColorScheme="dark">
        <Component {...pageProps} />
      </MantineProvider>
    </ThemeProvider>
  </>
}
