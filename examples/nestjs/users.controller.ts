class CreateUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

@ApiTags("Users")
@UseGuards(AuthGuard)
@Controller("users")
export class UsersController {
  @Get(":id")
  @ApiOperation({ summary: "Get a user" })
  findOne(@Param("id") id: string): { id: string } {
    return { id };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: "Create a user" })
  create(@Body() payload: CreateUserDto): { id: string; email: string } {
    return { id: "1", email: payload.email };
  }
}
