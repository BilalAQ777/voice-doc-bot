import { motion } from "framer-motion";

interface VoiceWaveformProps {
  isActive: boolean;
}

const VoiceWaveform = ({ isActive }: VoiceWaveformProps) => {
  const bars = Array.from({ length: 5 });

  return (
    <div className="flex items-center justify-center gap-1 h-12">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-primary rounded-full"
          animate={{
            height: isActive ? [12, 32, 12] : 12,
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

export default VoiceWaveform;
