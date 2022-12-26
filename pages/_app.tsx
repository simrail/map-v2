import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Script from 'next/script'
import {datadogRum} from "@datadog/browser-rum";

export default function App({ Component, pageProps }: AppProps) {


  datadogRum.init({
    applicationId: '74158ece-75c7-4ec6-a16d-35a629a98124',
    clientToken: 'pubab6b5a5079d46fbd6eb21a9b3448dc84',
    site: 'datadoghq.com',
    service:'simrail-map',

    // Specify a version number to identify the deployed version of your application in Datadog
    // version: '1.0.0',
    sampleRate: 100,
    sessionReplaySampleRate: 20,
    trackInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel:'mask-user-input'
  });

  datadogRum.startSessionReplayRecording();
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
