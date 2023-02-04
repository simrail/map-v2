import {Train} from "@simrail/types";
import {ProfileResponse} from "../pages/api/profile";

async function getData(selectedTrain: Train) {
    if (selectedTrain.TrainData.ControlledBySteamID) {
        let avatarRequest = await fetch('/api/profile?steamid=' + selectedTrain.TrainData.ControlledBySteamID);
        let profile: ProfileResponse = await avatarRequest.json();
        return [profile.avatarUrl, profile.username];
    } else {
        return ["BOT", null];
    }
}