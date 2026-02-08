import Image from "next/image";
import Test from "./Test";

export default function Home() {
  return (
    <div>
      <Test name="manoj" />
      <Test name="john" />
      <Test name="jane" />
    </div>
  );
}
