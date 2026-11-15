import React from "react";
import { Composition, registerRoot } from "remotion";
import { RoadShort, ROAD_FRAMES } from "./videos/road/Road";
import { DogShort, DOG_FRAMES } from "./videos/dog/Dog";

const Root: React.FC = () =>
  React.createElement(React.Fragment, null,
    React.createElement(Composition, { id: "RoadShort", component: RoadShort, durationInFrames: ROAD_FRAMES, fps: 30, width: 1080, height: 1920 }),
    React.createElement(Composition, { id: "DogShort", component: DogShort, durationInFrames: DOG_FRAMES, fps: 30, width: 1080, height: 1920 }));
registerRoot(Root);
