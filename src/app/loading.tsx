export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="relative flex items-center justify-center w-24 h-24">
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
        
        {/* Center NF Text */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-2xl font-black tracking-tighter text-white">NF</span>
        </div>
      </div>
    </div>
  );
}
