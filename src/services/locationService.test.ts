import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserLocation, resolveManualLocation, reverseBrowserLocation } from './locationService';

afterEach(() => vi.unstubAllGlobals());

describe('browser location service', () => {
  it('reverse geocodes WGS-84 browser coordinates through the same-origin backend', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ city: '北京市', district: '朝阳区', township: '建外街道', street: '建国路', number: '88号' }), { status: 200 }));
    const result = await reverseBrowserLocation(39.9042, 116.4074, fetcher as typeof fetch);

    expect(result).toMatchObject({ city: '北京市', district: '朝阳区', street: '建国路' });
    expect(fetcher.mock.calls[0][0]).toContain('location=116.4074%2C39.9042');
    expect(fetcher.mock.calls[0][0]).toContain('coordsys=gps');
  });

  it('returns the actual coordinates and resolved address without substituting a destination station', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ city: '北京市', district: '朝阳区', township: '建外街道', street: '建国路', number: '88号' }), { status: 200 })));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 39.9042, longitude: 116.4074 } } as GeolocationPosition) } });

    const result = await getBrowserLocation('武汉');

    expect(result).toMatchObject({ status: 'success', lat: 39.9042, lng: 116.4074, city: '武汉' });
    expect(result.name).toContain('北京市');
    expect(result.name).not.toContain('武汉站');
  });

  it('forward geocodes a custom starting place into real GCJ-02 coordinates', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ formattedAddress: '北京市朝阳区建国路88号', location: { lng: 116.457, lat: 39.908 } }), { status: 200 }));
    const result = await resolveManualLocation('北京建国路88号', fetcher as typeof fetch);

    expect(result).toEqual({ name: '北京市朝阳区建国路88号', lng: 116.457, lat: 39.908, coordinateSystem: 'gcj02' });
    expect(fetcher.mock.calls[0][0]).toContain('/api/location/geocode?address=');
  });
});
