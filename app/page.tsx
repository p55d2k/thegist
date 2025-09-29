import Image from "next/image";
import Link from "next/link";

const Home = () => {
  return (
    <div className="w-screen h-screen">
      <Image
        src="/bg.jpg"
        alt="bg"
        layout="fill"
        className="absolute -z-10 w-full h-full object-cover opacity-60"
      />
      <div className="h-full flex flex-col space-y-1 text-center items-center justify-center">
        <h1 className="text-5xl font-bold text-black">ZK Newsletter</h1>
        <p className="text-2xl text-black max-w-xl">
          A small newsletter project to deliver handpicked commentaries from a
          curated mix of opinion feeds every morning and evening.
        </p>
        <Link
          href="https://github.com/p55d2k/zk-newsletter"
          target="_blank"
          className="text-blue-700 underline text-2xl"
        >
          View on GitHub: Source Code
        </Link>
      </div>
    </div>
  );
};

export default Home;
