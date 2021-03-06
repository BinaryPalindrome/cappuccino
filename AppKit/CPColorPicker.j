/*
 * CPColorPicker.j
 * AppKit
 *
 * Created by Ross Boucher.
 * Copyright 2008, 280 North, Inc.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 */

@import <Foundation/Foundation.j>
@import <AppKit/CPView.j>
@import <AppKit/CPImage.j>
@import <AppKit/CPImageView.j>


/*! @class CPColorPicker

    <objj>CPColorPicker</objj> is an abstract superclass for all color picker subclasses. If you want a particular color picker, use <objj>CPColorPanel</objj>'s <code>setPickerMode:</code> method. The simplest way to implement your own color picker is to create a subclass of CPColorPicker.
*/
@implementation CPColorPicker : CPObject
{
    CPColorPanel    _panel;
    int             _mask;
}

/*!
    Initializes the color picker.
    @param aMask a unique unsigned int identifying your color picker
    @param aPanel the color panel that owns this picker
*/
- (id)initWithPickerMask:(int)aMask colorPanel:(CPColorPanel)aPanel
{
    self = [super init];
    
    _panel = aPanel;
    _mask  = aMask;
    
    return self;
}

/*!
    Returns the color panel that owns this picker
*/
- (CPColorPanel)colorPanel
{
    return _panel;
}

/*
    FIXME Not implemented.
    @return <code>nil</code>
    @ignore
*/
- (CPImage)provideNewButtonImage
{
    return nil;
}

/*!
    Sets the color picker's mode.
    @param mode the color panel mode
*/
- (void)setMode:(CPColorPanelMode)mode
{
    return;
}

/*!
    Sets the picker's color.
    @param aColor the new color for the picker
*/
- (void)setColor:(CPColor)aColor
{
    return;
}

@end

/*
    The wheel mode color picker.
    @ignore
*/
@implementation CPColorWheelColorPicker : CPColorPicker
{
    CPView          _pickerView;    
    CPView          _brightnessSlider;
    DOMElement      _brightnessBarImage;
    __CPColorWheel  _hueSaturationView;
}
 
- (id)initWithPickerMask:(int)mask colorPanel:(CPColorPanel)owningColorPanel 
{
    return [super initWithPickerMask:mask colorPanel: owningColorPanel];
}
  
-(id)initView
{
    aFrame = CPRectMake(0, 0, CPColorPickerViewWidth, CPColorPickerViewHeight);
    _pickerView = [[CPView alloc] initWithFrame:aFrame];
        
    var path = [[CPBundle bundleForClass: CPColorPicker] pathForResource:@"brightness_bar.png"]; 
    
    _brightnessBarImage = new Image();
    _brightnessBarImage.src = path;
    _brightnessBarImage.style.width = "100%";
    _brightnessBarImage.style.height = "100%";
    _brightnessBarImage.style.position = "absolute";
    _brightnessBarImage.style.top = "0px";
    _brightnessBarImage.style.left = "0px";

    var brightnessBarView = [[CPView alloc] initWithFrame: CPRectMake(0, (aFrame.size.height - 34), aFrame.size.width, 15)];
    [brightnessBarView setAutoresizingMask: (CPViewWidthSizable | CPViewMinYMargin)];
    brightnessBarView._DOMElement.appendChild(_brightnessBarImage);
        
    _brightnessSlider = [[CPSlider alloc] initWithFrame: CPRectMake(0, aFrame.size.height - 22, aFrame.size.width, 12)];
    [_brightnessSlider setMaxValue:  100.0];
    [_brightnessSlider setMinValue:    0.0];
    [_brightnessSlider setFloatValue:100.0];

    [_brightnessSlider setTarget: self];
    [_brightnessSlider setAction: @selector(brightnessSliderDidChange:)];
    [_brightnessSlider setAutoresizingMask: (CPViewWidthSizable | CPViewMinYMargin)];

    _hueSaturationView = [[__CPColorWheel alloc] initWithFrame: CPRectMake(0, 0, aFrame.size.width, aFrame.size.height - 38)];
    [_hueSaturationView setDelegate: self];
    [_hueSaturationView setAutoresizingMask: (CPViewWidthSizable | CPViewHeightSizable)];

    [_pickerView addSubview: brightnessBarView];
    [_pickerView addSubview: _hueSaturationView];
    [_pickerView addSubview: _brightnessSlider];
}

-(void)brightnessSliderDidChange:(id)sender
{
    [self updateColor];
}

-(void)colorWheelDidChange:(id)sender
{
    [self updateColor];
}

-(void)updateColor
{
    var hue        = [_hueSaturationView angle],
        saturation = [_hueSaturationView distance],
        brightness = [_brightnessSlider floatValue];

    [_hueSaturationView setWheelBrightness: brightness / 100.0];
    _brightnessBarImage.style.backgroundColor = "#"+[[CPColor colorWithHue: hue saturation: saturation brightness: 100] hexString];

    [[self colorPanel] setColor:[CPColor colorWithHue: hue saturation: saturation brightness: brightness]];    
}
  
- (BOOL)supportsMode:(int)mode 
{
    return (mode == CPWheelColorPickerMode) ? YES : NO;
}
 
- (int)currentMode 
{
    return CPWheelColorPickerMode;
}
 
- (CPView)provideNewView:(BOOL)initialRequest 
{
    if (initialRequest) 
        [self initView];
    
    return _pickerView;
}
 
- (void)setColor:(CPColor)newColor 
{
    var hsb = [newColor hsbComponents];
    
    [_hueSaturationView setPositionToColor:newColor];
    [_brightnessSlider setFloatValue:hsb[2]];
    [_hueSaturationView setWheelBrightness:hsb[2] / 100.0];

    _brightnessBarImage.style.backgroundColor = "#"+[[CPColor colorWithHue:hsb[0] saturation:hsb[1] brightness:100] hexString];
}

@end

/* @ignore */
@implementation __CPColorWheel : CPView
{
    DOMElement  _wheelImage;
    DOMElement  _blackWheelImage;
        
    CPView      _crosshair;
    
    id          _delegate;
    
    float       _angle;
    float       _distance;
    
    float       _radius;
}

-(id)initWithFrame:(CPRect)aFrame
{    
    self = [super initWithFrame: aFrame];
    
    var path = [[CPBundle bundleForClass: CPColorPicker] pathForResource:@"wheel.png"]; 

    _wheelImage = new Image();
    _wheelImage.src = path;
    _wheelImage.style.position = "absolute";
            
    path = [[CPBundle bundleForClass: CPColorPicker] pathForResource:@"wheel_black.png"]; 

    _blackWheelImage = new Image();
    _blackWheelImage.src = path;
    _blackWheelImage.style.opacity = "0";
    _blackWheelImage.style.filter = "alpha(opacity=0)"
    _blackWheelImage.style.position = "absolute";

    _DOMElement.appendChild(_wheelImage);
    _DOMElement.appendChild(_blackWheelImage);
    
    [self setWheelSize: aFrame.size];

    _crosshair = [[CPView alloc] initWithFrame:CPRectMake(_radius - 2, _radius - 2, 4, 4)];
    [_crosshair setBackgroundColor:[CPColor blackColor]];
    
    var view = [[CPView alloc] initWithFrame:CGRectInset([_crosshair bounds], 1.0, 1.0)];
    [view setBackgroundColor:[CPColor whiteColor]];
    
    [_crosshair addSubview:view];
        
    [self addSubview: _crosshair];  
    
    return self;
}

-(void)setWheelBrightness:(float)brightness
{
    _blackWheelImage.style.opacity = 1.0 - brightness;
    _blackWheelImage.style.filter = "alpha(opacity=" + (1.0 - brightness)*100 + ")"
}

-(void)setFrameSize:(CPSize)aSize
{
    [super setFrameSize: aSize];
    [self setWheelSize: aSize];
}

-(void)setWheelSize:(CPSize)aSize
{
    var min = MIN(aSize.width, aSize.height);

    _blackWheelImage.style.width = min;
    _blackWheelImage.style.height = min;
    _blackWheelImage.width = min;
    _blackWheelImage.height = min;
    _blackWheelImage.style.top = (aSize.height - min) / 2.0 + "px";
    _blackWheelImage.style.left = (aSize.width - min) / 2.0 + "px";

    _wheelImage.style.width = min;
    _wheelImage.style.height = min;
    _wheelImage.width = min;
    _wheelImage.height = min;
    _wheelImage.style.top = (aSize.height - min) / 2.0 + "px";
    _wheelImage.style.left = (aSize.width - min) / 2.0 + "px";

    _radius = min / 2.0;
    
    [self setAngle: [self degreesToRadians: _angle] distance: (_distance / 100.0) * _radius];
}

-(void)setDelegate:(id)aDelegate
{
    _delegate = aDelegate;
}

-(id)delegate
{
    return _delegate;
}

-(float)angle
{
    return _angle;
}

-(float)distance
{
    return _distance;
}

-(void)mouseDown:(CPEvent)anEvent
{
    [self reposition: anEvent];
}

-(void)mouseDragged:(CPEvent)anEvent
{
    [self reposition: anEvent];
}

-(void)reposition:(CPEvent)anEvent
{
    var bounds   = [self bounds],
        location = [self convertPoint: [anEvent locationInWindow] fromView: nil];

    var midX   = CGRectGetMidX(bounds);
    var midY   = CGRectGetMidY(bounds);
    
    var distance = MIN(SQRT((location.x - midX)*(location.x - midX) + (location.y - midY)*(location.y - midY)), _radius);
    var angle    = ATAN2(location.y - midY, location.x - midX);
    
    [self setAngle: angle distance: distance];

    if(_delegate)
        [_delegate colorWheelDidChange: self];
}

-(void)setAngle:(int)angle distance:(float)distance
{
    var bounds = [self bounds];
    var midX   = CGRectGetMidX(bounds);
    var midY   = CGRectGetMidY(bounds);
    
    _angle     = [self radiansToDegrees: angle];
    _distance  = (distance / _radius) * 100.0;  
    
    [_crosshair setFrameOrigin:CPPointMake(COS(angle) * distance + midX - 2.0, SIN(angle) * distance + midY - 2.0)];
}

-(void)setPositionToColor:(CPColor)aColor
{
    var hsb    = [aColor hsbComponents],
        bounds = [self bounds];
        
    var angle    = [self degreesToRadians: hsb[0]],
        distance = (hsb[1] / 100.0) * _radius;
        
    [self setAngle: angle distance: distance];
}

-(int)radiansToDegrees:(float)radians
{
    return ((-radians / PI) * 180 + 360) % 360;
}

-(float)degreesToRadians:(float)degrees
{
    return -(((degrees - 360) / 180) * PI);
}

@end