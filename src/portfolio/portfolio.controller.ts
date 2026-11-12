import { Controller, Get, Param } from '@nestjs/common';
import { GetPortfolioParams } from './dto/get-portfolio.params';
import { PortfolioResponse } from './dto/portfolio.response';
import { PortfolioService } from './portfolio.service';

@Controller('users')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get(':id/portfolio')
  getPortfolio(
    @Param() params: GetPortfolioParams,
  ): Promise<PortfolioResponse> {
    return this.portfolioService.getPortfolio(params.id);
  }
}
