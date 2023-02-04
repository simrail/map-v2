import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Script from 'next/script'

export default function Home({ Component, pageProps }: AppProps) {

  return <>
    <Script async src="https://www.googletagmanager.com/gtag/js?id=G-XEMEDP2BGJ"></Script>
    <Script id='gtag'>
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());

        gtag('config', 'G-XEMEDP2BGJ');
        `}

    </Script>
    <Component {...pageProps} />
  </>
}
