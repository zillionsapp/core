import app from '../src/api/server';

export default (req: any, res: any) => {
    return app(req, res);
};
