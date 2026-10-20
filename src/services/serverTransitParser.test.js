import { describe, expect, it } from 'vitest';
import { parsePolyline, parseTransitLegs } from '../../server/index.js';

describe('Sites transit proxy parser', () => {
  it('parses AMap coordinate strings and discards invalid points', () => {
    expect(parsePolyline('114.1,30.1;bad;114.2,30.2')).toEqual([[114.1, 30.1], [114.2, 30.2]]);
  });

  it('turns walking and subway results into display-ready legs', () => {
    const legs = parseTransitLegs({ segments: [{
      walking: { distance: '600', duration: '480', steps: [{ instruction: '沿江汉路步行300米', road_name: '江汉路', polyline: '114.1,30.1;114.11,30.11' }] },
      entrance: { name: 'C口' }, exit: { name: 'A口' },
      bus: { buslines: [{ name: '轨道交通2号线(天河机场--佛祖岭)', type: '地铁线路', departure_stop: { name: '江汉路' }, arrival_stop: { name: '洪山广场' }, via_stops: [{ name: '循礼门' }], duration: '900', distance: '7200', start_time: '0600', end_time: '2300', polyline: '114.11,30.11;114.3,30.5' }] },
    }] }, 'segment');

    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ mode: 'walk', instructions: ['沿江汉路步行300米'], roadNames: ['江汉路'] });
    expect(legs[1]).toMatchObject({ mode: 'subway', lineName: '轨道交通2号线', departureStop: '江汉路', arrivalStop: '洪山广场', entrance: 'C口', exit: 'A口', viaStops: ['循礼门'], serviceStartTime: '06:00', serviceEndTime: '23:00' });
  });

  it('reads AMap v5 transit geometry given as { polyline } objects', () => {
    // 生产环境实测：v5 公交接口的步行与公交线形是对象，以前被解析成空数组，地图上只剩点没有线。
    const legs = parseTransitLegs({ segments: [{
      walking: { distance: '300', duration: '240', steps: [{ instruction: '步行300米', polyline: { polyline: '111.37,30.69;111.371,30.691' } }] },
      bus: { buslines: [{ name: 'B353路专线', type: '普通公交线路', duration: '1200', distance: '6800', polyline: { polyline: '111.371,30.691;111.38,30.70;111.39,30.71' } }] },
    }] }, 'seg');
    expect(legs.map((leg) => leg.polyline.length)).toEqual([2, 3]);
    expect(parsePolyline({ polyline: '111.1,30.1;111.2,30.2' })).toEqual([[111.1, 30.1], [111.2, 30.2]]);
  });
});
