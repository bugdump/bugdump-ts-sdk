export type AnnotationTool = 'arrow' | 'box' | 'text' | 'blur' | 'freehand';

export interface Point {
  x: number;
  y: number;
}

interface BaseDrawOperation {
  id: string;
  tool: AnnotationTool;
  color: string;
  lineWidth: number;
  timestamp: number;
}

export interface ArrowOperation extends BaseDrawOperation {
  tool: 'arrow';
  start: Point;
  end: Point;
}

export interface BoxOperation extends BaseDrawOperation {
  tool: 'box';
  start: Point;
  end: Point;
}

export interface TextOperation extends BaseDrawOperation {
  tool: 'text';
  position: Point;
  text: string;
  fontSize: number;
}

export interface BlurOperation extends BaseDrawOperation {
  tool: 'blur';
  start: Point;
  end: Point;
  blurRadius: number;
}

export interface FreehandOperation extends BaseDrawOperation {
  tool: 'freehand';
  points: Point[];
}

export type DrawOperation =
  | ArrowOperation
  | BoxOperation
  | TextOperation
  | BlurOperation
  | FreehandOperation;

const ARROW_HEAD_LENGTH = 15;
const ARROW_HEAD_ANGLE = Math.PI / 6;
const DEFAULT_COLOR = '#ff0000';
const DEFAULT_LINE_WIDTH = 3;
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_BLUR_RADIUS = 10;

let idCounter = 0;

function generateId(): string {
  return `ann_${Date.now()}_${++idCounter}`;
}

function renderArrow(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  lineWidth: number,
): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - ARROW_HEAD_LENGTH * Math.cos(angle - ARROW_HEAD_ANGLE),
    end.y - ARROW_HEAD_LENGTH * Math.sin(angle - ARROW_HEAD_ANGLE),
  );
  ctx.lineTo(
    end.x - ARROW_HEAD_LENGTH * Math.cos(angle + ARROW_HEAD_ANGLE),
    end.y - ARROW_HEAD_LENGTH * Math.sin(angle + ARROW_HEAD_ANGLE),
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function renderBox(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  lineWidth: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  ctx.restore();
}

function renderText(
  ctx: CanvasRenderingContext2D,
  position: Point,
  text: string,
  color: string,
  fontSize: number,
): void {
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = 'top';

  const padding = 4;
  const metrics = ctx.measureText(text);
  const textHeight = fontSize * 1.2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(
    position.x - padding,
    position.y - padding,
    metrics.width + padding * 2,
    textHeight + padding * 2,
  );

  ctx.fillStyle = color;
  ctx.fillText(text, position.x, position.y);
  ctx.restore();
}

function renderBlurRegion(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  start: Point,
  end: Point,
  blurRadius: number,
): void {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  if (w === 0 || h === 0) return;

  ctx.save();
  ctx.filter = `blur(${blurRadius}px)`;
  ctx.drawImage(canvas, x, y, w, h, x, y, w, h);
  ctx.filter = 'none';

  ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.restore();
}

function renderFreehand(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  lineWidth: number,
): void {
  if (points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const first = points[0]!;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const pt = points[i]!;
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.restore();
}

function renderOperation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  op: DrawOperation,
): void {
  switch (op.tool) {
    case 'arrow':
      renderArrow(ctx, op.start, op.end, op.color, op.lineWidth);
      break;
    case 'box':
      renderBox(ctx, op.start, op.end, op.color, op.lineWidth);
      break;
    case 'text':
      renderText(ctx, op.position, op.text, op.color, op.fontSize);
      break;
    case 'blur':
      renderBlurRegion(ctx, canvas, op.start, op.end, op.blurRadius);
      break;
    case 'freehand':
      renderFreehand(ctx, op.points, op.color, op.lineWidth);
      break;
  }
}

export function renderOperationsToCanvas(
  ctx: CanvasRenderingContext2D,
  operations: DrawOperation[],
): void {
  for (const op of operations) {
    renderOperation(ctx, ctx.canvas, op);
  }
}

export class AnnotationOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private operations: DrawOperation[] = [];
  private currentTool: AnnotationTool = 'arrow';
  private color = DEFAULT_COLOR;
  private lineWidth = DEFAULT_LINE_WIDTH;
  private fontSize = DEFAULT_FONT_SIZE;
  private blurRadius = DEFAULT_BLUR_RADIUS;

  private isDrawing = false;
  private startPoint: Point | null = null;
  private currentPoints: Point[] = [];
  private screenshotImage: HTMLImageElement | null = null;
  private activeTextInput: HTMLInputElement | null = null;

  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;

  constructor(
    private container: HTMLElement,
    private width: number,
    private height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;touch-action:none;';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.ctx = ctx;

    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);

    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.addEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.addEventListener('pointerup', this.onPointerUpBound);

    this.container.appendChild(this.canvas);
  }

  setScreenshotImage(image: HTMLImageElement): void {
    this.screenshotImage = image;
    this.redraw();
  }

  setTool(tool: AnnotationTool): void {
    this.currentTool = tool;
  }

  getTool(): AnnotationTool {
    return this.currentTool;
  }

  setColor(color: string): void {
    this.color = color;
  }

  setLineWidth(lineWidth: number): void {
    this.lineWidth = lineWidth;
  }

  setFontSize(fontSize: number): void {
    this.fontSize = fontSize;
  }

  setBlurRadius(radius: number): void {
    this.blurRadius = radius;
  }

  getOperations(): DrawOperation[] {
    return [...this.operations];
  }

  getCanvasWidth(): number {
    return this.width;
  }

  getCanvasHeight(): number {
    return this.height;
  }

  undo(): void {
    this.operations.pop();
    this.redraw();
  }

  clear(): void {
    this.operations = [];
    this.redraw();
  }

  addTextAtPosition(position: Point, text: string): void {
    const op: TextOperation = {
      id: generateId(),
      tool: 'text',
      color: this.color,
      lineWidth: this.lineWidth,
      position,
      text,
      fontSize: this.fontSize,
      timestamp: Date.now(),
    };
    this.operations.push(op);
    this.redraw();
  }

  destroy(): void {
    this.dismissActiveTextInput();
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.onPointerUpBound);
    this.canvas.remove();
  }

  private getCanvasPoint(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.width,
      y: ((e.clientY - rect.top) / rect.height) * this.height,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);

    const point = this.getCanvasPoint(e);
    this.startPoint = point;

    if (this.currentTool === 'text') {
      this.promptTextInput(point);
      return;
    }

    this.isDrawing = true;

    if (this.currentTool === 'freehand') {
      this.currentPoints = [point];
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDrawing || !this.startPoint) return;
    e.preventDefault();

    const point = this.getCanvasPoint(e);

    if (this.currentTool === 'freehand') {
      this.currentPoints.push(point);
    }

    this.redraw();
    this.drawPreview(point);
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.isDrawing || !this.startPoint) return;
    e.preventDefault();

    const endPoint = this.getCanvasPoint(e);

    switch (this.currentTool) {
      case 'arrow':
        this.operations.push({
          id: generateId(),
          tool: 'arrow',
          color: this.color,
          lineWidth: this.lineWidth,
          start: this.startPoint,
          end: endPoint,
          timestamp: Date.now(),
        });
        break;
      case 'box':
        this.operations.push({
          id: generateId(),
          tool: 'box',
          color: this.color,
          lineWidth: this.lineWidth,
          start: this.startPoint,
          end: endPoint,
          timestamp: Date.now(),
        });
        break;
      case 'blur':
        this.operations.push({
          id: generateId(),
          tool: 'blur',
          color: this.color,
          lineWidth: this.lineWidth,
          start: this.startPoint,
          end: endPoint,
          blurRadius: this.blurRadius,
          timestamp: Date.now(),
        });
        break;
      case 'freehand':
        this.currentPoints.push(endPoint);
        this.operations.push({
          id: generateId(),
          tool: 'freehand',
          color: this.color,
          lineWidth: this.lineWidth,
          points: [...this.currentPoints],
          timestamp: Date.now(),
        });
        this.currentPoints = [];
        break;
      case 'text':
        break;
    }

    this.isDrawing = false;
    this.startPoint = null;
    this.redraw();
  }

  private promptTextInput(position: Point): void {
    this.dismissActiveTextInput();

    const rect = this.canvas.getBoundingClientRect();
    const screenX = (position.x / this.width) * rect.width + rect.left;
    const screenY = (position.y / this.height) * rect.height + rect.top;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type text…';
    input.style.cssText = `
      position:fixed;left:${screenX}px;top:${screenY}px;
      font-size:${this.fontSize}px;font-family:sans-serif;
      color:${this.color};background:rgba(0,0,0,0.7);
      border:1px solid rgba(255,255,255,0.3);border-radius:4px;
      padding:2px 6px;outline:none;z-index:2147483647;
      min-width:100px;
    `;
    this.activeTextInput = input;
    this.container.appendChild(input);
    input.focus();

    const commit = () => {
      const text = input.value.trim();
      if (text) {
        this.addTextAtPosition(position, text);
      }
      this.dismissActiveTextInput();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        this.dismissActiveTextInput();
      }
    });
    input.addEventListener('blur', commit);
  }

  private dismissActiveTextInput(): void {
    if (this.activeTextInput) {
      this.activeTextInput.remove();
      this.activeTextInput = null;
    }
  }

  private drawPreview(currentPoint: Point): void {
    if (!this.startPoint) return;

    switch (this.currentTool) {
      case 'arrow':
        renderArrow(this.ctx, this.startPoint, currentPoint, this.color, this.lineWidth);
        break;
      case 'box':
        renderBox(this.ctx, this.startPoint, currentPoint, this.color, this.lineWidth);
        break;
      case 'blur':
        renderBlurRegion(this.ctx, this.canvas, this.startPoint, currentPoint, this.blurRadius);
        break;
      case 'freehand':
        renderFreehand(this.ctx, this.currentPoints, this.color, this.lineWidth);
        break;
      case 'text':
        break;
    }
  }

  private redraw(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (this.screenshotImage) {
      this.ctx.drawImage(this.screenshotImage, 0, 0, this.width, this.height);
    }

    for (const op of this.operations) {
      renderOperation(this.ctx, this.canvas, op);
    }
  }
}
