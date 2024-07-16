import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { GoogleTagManager } from '@next/third-parties/google'

export default function Home({ Component, pageProps }: AppProps) {

  return <>
    {process.env.NODE_ENV !== 'development' && <GoogleTagManager gtmId="GTM-TWKQ769Q" />}
    <Component {...pageProps} />
  </>
}
