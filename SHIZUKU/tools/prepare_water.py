"""Prepare a recorded-water instrument; no oscillator is used.
Input: decoded CC0 Zaziesound 496304 recording at 22050 Hz, mono PCM16.
Usage: python3 prepare_water.py /path/to/recording.wav
"""
import sys,wave
from pathlib import Path
import numpy as np
rate=22050
with wave.open(sys.argv[1]) as w:
 assert w.getframerate()==rate and w.getnchannels()==1
 recording=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(float)/32768
# Isolate one water contact, excluding the following drops and room rumble.
x=recording[int(80.885*rate):int(81.085*rate)].copy()
f=np.fft.rfftfreq(len(x),1/rate);spec=np.fft.rfft(x)
spec*= (1-np.exp(-(f/240)**4))*np.exp(-(f/3800)**4)
x=np.fft.irfft(spec,n=len(x));x*=np.minimum(1,np.arange(len(x))/(rate*.008));x*=np.minimum(1,np.arange(len(x))[::-1]/(rate*.035))
# Phase vocoder stretches the changing recorded spectrum, rather than looping a tone.
def stretch(x,factor):
 size=1024;hop=128;window=np.hanning(size);x=np.pad(x,(size,size))
 frames=np.array([np.fft.rfft(x[i:i+size]*window) for i in range(0,len(x)-size,hop)])
 steps=np.arange(0,len(frames)-1,1/factor);out=np.zeros(len(steps)*hop+size);weight=out.copy();phase=np.angle(frames[0]);advance=2*np.pi*hop*np.arange(size//2+1)/size
 for k,t in enumerate(steps):
  i=int(t);a=t-i;mag=(1-a)*abs(frames[i])+a*abs(frames[i+1]);delta=np.angle(frames[i+1])-np.angle(frames[i])-advance;delta-=2*np.pi*np.round(delta/(2*np.pi));phase+=advance+delta
  grain=np.fft.irfft(mag*np.exp(1j*phase))*window;j=k*hop;out[j:j+size]+=grain;weight[j:j+size]+=window**2
 out/=np.maximum(weight,.01)
 return out[int(size*factor):int(size*factor)+int(.20*rate*factor)]
y=stretch(x,7)
# Slow the actual water resonance into C4. Broad moving resonances remain audible.
source_hz=1025;speed=261.625565/source_hz
y=np.interp(np.arange(0,len(y)-1,speed),np.arange(len(y)),y)
t=np.arange(len(y))/rate;y*= (1-np.exp(-t/.085)) * np.exp(-t/3.6)
y*=np.minimum(1,(len(y)-np.arange(len(y)))/(rate*.8));y-=np.mean(y);y*=.78/max(abs(y))
out=Path(__file__).resolve().parents[1]/'assets/water/body-c4.wav'
with wave.open(str(out),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes((y*32767).astype('<i2').tobytes())
print('Recorded water body:',round(len(y)/rate,2),'seconds')
