import { useLocalWebcamPublisherController, type LocalWebcamPublisherProps } from "@streaming/hooks/publishing/useLocalWebcamPublisherController";
import { LocalWebcamPublisherView } from "./publisher/LocalWebcamPublisherView";
import "./LocalWebcamPublisher.css";

export type { LocalWebcamPublisherProps };

export function LocalWebcamPublisher(props: LocalWebcamPublisherProps) {
  const viewProps = useLocalWebcamPublisherController(props);
  return <LocalWebcamPublisherView {...viewProps} />;
}

export default LocalWebcamPublisher;
