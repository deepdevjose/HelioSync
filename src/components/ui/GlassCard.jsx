import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";

const MotionDiv = motion.div;

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const GlassCard = ({ children, className, delay = 0 }) => {
  return (
    <MotionDiv
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay, ease: "easeOut" }}
      whileHover={{ scale: 1.02, backgroundColor: "rgba(255, 255, 255, 0.08)" }}
      className={cn("glass-panel rounded-3xl p-6 transition-all duration-500", className)}
    >
      {children}
    </MotionDiv>
  );
};
