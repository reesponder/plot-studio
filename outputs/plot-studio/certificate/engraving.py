from math import cos, pi, sin

from reportlab.lib.colors import HexColor


def draw_engraving(canvas):
    centre = 679
    ink = HexColor("#a4845d")
    fine = HexColor("#b79d76")
    canvas.saveState()
    canvas.setLineJoin(1)
    canvas.setLineCap(1)

    def pen(width=.45, pale=False):
        canvas.setLineWidth(width)
        canvas.setStrokeColor(fine if pale else ink)

    def line(x1, y1, x2, y2):
        canvas.line(centre + x1, y1, centre + x2, y2)

    def box(x, y, width, height):
        canvas.rect(centre + x, y, width, height, stroke=1, fill=0)

    def circle(x, y, radius):
        canvas.circle(centre + x, y, radius, stroke=1, fill=0)

    def poly(points, closed=False):
        path = canvas.beginPath()
        path.moveTo(centre + points[0][0], points[0][1])
        for x, y in points[1:]:
            path.lineTo(centre + x, y)
        if closed:
            path.close()
        canvas.drawPath(path, stroke=1, fill=0)

    def lancet(x, base, shoulder, apex, radius, closed=True):
        path = canvas.beginPath()
        path.moveTo(centre + x - radius, base)
        path.lineTo(centre + x - radius, shoulder)
        path.curveTo(centre + x - radius, shoulder + (apex - shoulder) * .43,
                     centre + x - radius * .47, apex - (apex - shoulder) * .25,
                     centre + x, apex)
        path.curveTo(centre + x + radius * .47, apex - (apex - shoulder) * .25,
                     centre + x + radius, shoulder + (apex - shoulder) * .43,
                     centre + x + radius, shoulder)
        path.lineTo(centre + x + radius, base)
        if closed:
            path.close()
        canvas.drawPath(path, stroke=1, fill=0)

    def rails(left, right, *heights):
        for height in heights:
            line(left, height, right, height)

    def diamond(x, y, radius):
        poly([(x, y + radius), (x + radius, y), (x, y - radius), (x - radius, y)], True)

    def petal_wheel(cx, cy, radius, petals):
        circle(cx, cy, radius)
        circle(cx, cy, radius * .83)
        circle(cx, cy, radius * .23)
        for step in range(petals):
            angle = step * 2 * pi / petals
            dx, dy = cos(angle), sin(angle)
            root = (cx + dx * radius * .23, cy + dy * radius * .23)
            outer = (cx + dx * radius * .80, cy + dy * radius * .80)
            bow = radius * .30
            path = canvas.beginPath()
            path.moveTo(centre + root[0], root[1])
            path.curveTo(centre + cx + dx * radius * .43 - dy * bow,
                         cy + dy * radius * .43 + dx * bow,
                         centre + outer[0] - dy * bow * .45, outer[1] + dx * bow * .45,
                         centre + outer[0], outer[1])
            path.curveTo(centre + outer[0] + dy * bow * .45, outer[1] - dx * bow * .45,
                         centre + cx + dx * radius * .43 + dy * bow,
                         cy + dy * radius * .43 - dx * bow,
                         centre + root[0], root[1])
            canvas.drawPath(path, stroke=1, fill=0)

    pen(.68)
    poly([(-90, 34), (-90, 41), (-82, 41), (-82, 48), (-76, 48), (-76, 57),
          (-72, 63), (-72, 197), (-79, 204), (-79, 210), (-87, 215),
          (-87, 221), (-72, 226), (-72, 326), (-77, 330), (-77, 336),
          (-72, 341), (-47, 427), (-49, 434), (-49, 441), (-42, 445),
          (-42, 503), (-47, 508), (-47, 514), (-36, 519), (-5, 548)],
         )
    poly([(90, 34), (90, 41), (82, 41), (82, 48), (76, 48), (76, 57),
          (72, 63), (72, 197), (79, 204), (79, 210), (87, 215),
          (87, 221), (72, 226), (72, 326), (77, 330), (77, 336),
          (72, 341), (47, 427), (49, 434), (49, 441), (42, 445),
          (42, 503), (47, 508), (47, 514), (36, 519), (5, 548)],
         )
    rails(-90, 90, 34, 41)
    rails(-82, 82, 48)
    rails(-76, 76, 57)
    rails(-72, 72, 64, 196, 227, 326, 342)
    rails(-87, 87, 215, 221)
    rails(-79, 79, 204, 210)
    rails(-77, 77, 330, 336)
    rails(-47, 47, 427, 434, 441, 509, 514)
    rails(-42, 42, 445, 503)

    pen()
    for sign in (-1, 1):
        for x in (66, 69):
            line(sign * x, 65, sign * x, 196)
            line(sign * x, 228, sign * x, 324)
        for height in (77, 96, 117, 140, 161, 182):
            line(sign * 69, height, sign * 58, height)
        for height in (244, 265, 287, 309):
            line(sign * 69, height, sign * 55, height)
        lancet(sign * 53, 75, 131, 169, 10)
        lancet(sign * 53, 80, 130, 157, 6.7)
        line(sign * 53, 80, sign * 53, 153)
        lancet(sign * 52, 237, 287, 320, 11)
        lancet(sign * 52, 241, 288, 311, 7.5)
        line(sign * 52, 241, sign * 52, 309)

    pen(.53)
    lancet(0, 58, 122, 187, 40)
    lancet(0, 61, 123, 176, 35)
    lancet(0, 65, 123, 165, 30)
    line(0, 65, 0, 150)
    for x in (-17, 17):
        lancet(x, 67, 99, 130, 11)
        lancet(x, 72, 98, 121, 7.5)
        diamond(x, 89, 3)
    petal_wheel(0, 143, 11, 5)
    rails(-30, 30, 65, 84, 100)

    pen(.39, pale=True)
    for base in range(-25, 27, 5):
        line(base, 65, base, 82)
    for height in range(74, 191, 7):
        line(-70, height, -66, height)
        line(66, height, 70, height)
    for delta in (-2, -1, 0, 1, 2):
        line(-9 + delta * 2, 38, -3 + delta * 2, 43)
    for side in (-1, 1):
        for y in range(74, 129, 8):
            line(side * 36, y, side * 40, y + 2)
        for y in range(87, 143, 10):
            line(side * 59, y, side * 62, y + 1)
        for y in range(242, 292, 10):
            line(side * 58, y, side * 62, y + 1)

    pen(.44)
    for x in range(-66, 67, 12):
        box(x - 4.5, 204, 9, 6)
        diamond(x, 207, 1.6)
    for x in range(-68, 69, 8):
        line(x, 219, x + 3, 222)
    for sign in (-1, 1):
        x = sign * 74
        poly([(x - 8, 227), (x - 8, 291), (x - 5, 296), (x - 5, 313), (x, 342),
              (x + 5, 313), (x + 5, 296), (x + 8, 291), (x + 8, 227)])
        rails(x - 8, x + 8, 234, 239, 281, 290)
        rails(x - 5, x + 5, 299, 307)
        line(x, 293, x, 336)
        circle(x, 341, 1.8)
        lancet(x, 244, 266, 279, 4.3)

    pen(.52)
    poly([(-37, 236), (-37, 278), (-30, 289), (0, 325), (30, 289), (37, 278), (37, 236)], True)
    poly([(-33, 241), (-33, 276), (0, 317), (33, 276), (33, 241)], True)
    petal_wheel(0, 279, 18, 8)
    for x, cy in ((-24, 255), (-8, 246), (10, 252), (26, 261)):
        circle(x, cy, 2.1)
    poly([(-22, 255), (-17, 255), (-13, 246), (-10, 246)])
    poly([(-6, 246), (1, 246), (6, 252), (8, 252)])
    poly([(12, 252), (18, 252), (22, 261), (24, 261)])
    for x in (-52, -36, -19, 0, 19, 36, 52):
        box(x - 3, 331, 6, 4)

    pen(.46)
    poly([(-67, 343), (-45, 425), (-42, 425), (-62, 343)])
    poly([(67, 343), (45, 425), (42, 425), (62, 343)])
    for height in range(349, 426, 8):
        x = 65 - (height - 349) * .265
        gap = min(26, max(0, (413 - height) * 26 / 38))
        if gap:
            line(-x, height, -gap, height)
            line(gap, height, x, height)
        else:
            line(-x, height, x, height)
    pen(.50)
    poly([(-26, 344), (-26, 375), (0, 413), (26, 375), (26, 344)], True)
    poly([(-21, 348), (-21, 375), (0, 403), (21, 375), (21, 348)], True)
    lancet(0, 351, 371, 394, 11)
    lancet(0, 355, 371, 385, 7)
    line(0, 355, 0, 383)
    rails(-11, 11, 360, 367, 374)
    diamond(0, 399, 4)
    for sign in (-1, 1):
        for y in range(350, 409, 9):
            x = 59 - (y - 350) * .25
            line(sign * x, y, sign * (x - 7), y + 7)

    pen(.43)
    for x in (-27, -9, 9, 27):
        lancet(x, 452, 479, 498, 7)
        lancet(x, 455, 478, 490, 4)
        line(x, 455, x, 488)
        circle(x, 493, 1.1)
    for x in (-36, -18, 0, 18, 36):
        box(x - 1.3, 449, 2.6, 52)
    rails(-42, 42, 449, 501)
    for x in range(-42, 43, 7):
        line(x, 507, x + 3.7, 511)
    poly([(-35, 519), (-15, 535), (-5, 550), (5, 550), (15, 535), (35, 519)], True)
    poly([(-26, 522), (0, 544), (26, 522)])
    for height in (522, 527, 532, 537):
        x = 25 - (height - 522) * 1.1
        line(-x, height, x, height)

    pen(.59)
    poly([(-4, 540), (-4, 551), (-8, 556), (-8, 565), (-6, 568), (-5, 578),
          (0, 588), (3, 583), (8, 573), (8, 565), (8, 556),
          (4, 551), (4, 540)], True)
    rails(-8, 8, 556, 559, 565)
    rails(-4, 4, 545, 550)
    pen(.38)
    poly([(-4, 568), (-2, 575), (0, 583)])
    poly([(1, 568), (3, 575), (2, 580)])
    line(5, 568, 6, 574)
    circle(0, 588, 1.6)

    canvas.restoreState()
