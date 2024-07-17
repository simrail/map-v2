import { useMap } from 'react-leaflet';
import style from '../styles/BottomLeftControls.module.css';
import { MdFullscreen, MdFullscreenExit, MdOutlineTraffic, MdSpeakerNotes, MdSpeakerNotesOff, MdTraffic, MdZoomIn, MdZoomOut } from 'react-icons/md';
import { useFullscreen } from '@mantine/hooks';
import { useShowSignalStatus } from 'contexts/ShowSignalStatusContext';

export const BottomLeftControls = () => {

    const map = useMap();

    const { toggle: toggleFullscreen, fullscreen } = useFullscreen();
    let FullscreenIcon = (fullscreen ? MdFullscreenExit : MdFullscreen);

    const { showSignalInfo, setShowSignalInfo } = useShowSignalStatus()


    let ShowSignalStatusIcon = (showSignalInfo === true ? MdTraffic : MdOutlineTraffic)
    // let RenderPopupIcon = (renderPopup === true ? MdSpeakerNotes : MdSpeakerNotesOff)

    return <div className={style.container}>
        <a href='https://discord.gg/d65Q8gWM5W' rel="noreferrer" target="_blank" >
            <img src='https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6ca814282eca7172c6_icon_clyde_white_RGB.svg' className={[style.icon, style.discord].join(" ")} height={24} width={24} />
        </a>
        <MdZoomIn onClick={() => map.zoomIn()} className={style.icon} size={24} />
        <MdZoomOut onClick={() => map.zoomOut()} className={style.icon} size={24} />
        <ShowSignalStatusIcon onClick={() => setShowSignalInfo(!showSignalInfo)} className={style.icon} size={24} />
        <FullscreenIcon onClick={() => toggleFullscreen()} className={style.icon} size={24} />
    </div >;
};
